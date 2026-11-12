/**
 * Vault port (hexagonal architecture). Application code depends only on
 * IVaultPort; LocalPostgresVaultAdapter is today's implementation and talks
 * exclusively to the SECURITY DEFINER functions of db/0221. A remote enclave
 * adapter (mTLS gRPC to a Rust AMD SEV-SNP service) can implement the same
 * interface 1:1: every method is a single request with plain bytes and
 * strings, the caller is explicit, and no method exposes SQL, rows or sessions.
 *
 * The port moves sealed envelopes only. It never sees plaintext and never
 * decrypts: opening an envelope is the key holder's job (pqc-envelope.ts).
 * Every denial is the same VaultDeniedError; the reason stays in the enclave's
 * audit log.
 */
import { z } from "zod";
import { cleanContextId } from "@/lib/db-context";
import { ENVELOPE_MAX_BYTES } from "@/lib/crypto-enclave/pqc-envelope";
import { OPAQUE_TOKEN_KINDS, opaqueTokenKind, parseOpaqueToken, type OpaqueToken, type OpaqueTokenKind } from "./token-boundary";

/** An authenticated member (public user id from the server session, never from input). */
export type VaultCaller = { readonly userId: string };
/** A passkey step-up the server verified; proofId as registered in the enclave. */
export type PasskeyStepUp = { readonly verified: true; readonly proofId: string };
export type VaultEnvelope<K extends OpaqueTokenKind> = { readonly kind: K; readonly envelope: Uint8Array };

export interface IVaultPort {
  /** Records a just-verified passkey step-up on the enclave's own clock. */
  registerPasskeyStepUp(caller: VaultCaller, proofId: string): Promise<void>;
  storeToken<K extends OpaqueTokenKind>(caller: VaultCaller, kind: K, envelope: Uint8Array): Promise<OpaqueToken<K>>;
  retrieveToken<K extends OpaqueTokenKind>(caller: VaultCaller, ref: OpaqueToken<K>, stepUp: PasskeyStepUp): Promise<VaultEnvelope<K>>;
}

export class VaultDeniedError extends Error {
  constructor() {
    super("vault_denied");
    this.name = "VaultDeniedError";
  }
}

/** Runs one statement as `userId` (transaction-scoped context) and returns its rows. */
export type VaultSqlExecutor = (userId: string, query: string, params: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX_RE = /^[0-9a-f]*$/;

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) throw new VaultDeniedError();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

const RegisterRow = z.object({ ok: z.boolean() });
const StoreRow = z.object({ ref: z.string().nullable() });
const RetrieveRow = z.object({
  granted: z.boolean(),
  token_type: z.enum(OPAQUE_TOKEN_KINDS).nullable(),
  payload_hex: z.string().max(ENVELOPE_MAX_BYTES * 2).nullable(),
});

function callerId(caller: VaultCaller): string {
  const id = cleanContextId(caller.userId);
  if (!id) throw new VaultDeniedError();
  return id;
}

async function defaultExecutor(userId: string, query: string, params: readonly unknown[]) {
  const { runQuery, withDbContext } = await import("@/lib/neon");
  return (await withDbContext({ userId, workspaceId: null }, () => runQuery(query, [...params]))).rows;
}

export class LocalPostgresVaultAdapter implements IVaultPort {
  constructor(private readonly exec: VaultSqlExecutor = defaultExecutor) {}

  async registerPasskeyStepUp(caller: VaultCaller, proofId: string): Promise<void> {
    if (!UUID_RE.test(proofId)) throw new VaultDeniedError();
    const rows = await this.exec(callerId(caller), "select vault_enclave.register_step_up_proof($1::uuid, 'passkey') as ok", [proofId]);
    const row = RegisterRow.safeParse(rows[0]);
    if (!row.success || !row.data.ok) throw new VaultDeniedError();
  }

  async storeToken<K extends OpaqueTokenKind>(caller: VaultCaller, kind: K, envelope: Uint8Array): Promise<OpaqueToken<K>> {
    if (!OPAQUE_TOKEN_KINDS.includes(kind) || envelope.length > ENVELOPE_MAX_BYTES) throw new VaultDeniedError();
    const rows = await this.exec(callerId(caller), "select vault_enclave.store_opaque_token($1, decode($2, 'hex')) as ref", [kind, toHex(envelope)]);
    const row = StoreRow.safeParse(rows[0]);
    if (!row.success || row.data.ref === null) throw new VaultDeniedError();
    try {
      return parseOpaqueToken(row.data.ref, kind);
    } catch {
      throw new VaultDeniedError();
    }
  }

  async retrieveToken<K extends OpaqueTokenKind>(caller: VaultCaller, ref: OpaqueToken<K>, stepUp: PasskeyStepUp): Promise<VaultEnvelope<K>> {
    const kind = opaqueTokenKind(ref);
    if (stepUp.verified !== true || !UUID_RE.test(stepUp.proofId)) throw new VaultDeniedError();
    const rows = await this.exec(
      callerId(caller),
      "select granted, token_type, encode(encrypted_payload, 'hex') as payload_hex from vault_enclave.retrieve_opaque_token($1, $2, $3::uuid)",
      [ref, true, stepUp.proofId],
    );
    const row = RetrieveRow.safeParse(rows[0]);
    if (!row.success || !row.data.granted || row.data.token_type !== kind || row.data.payload_hex === null) throw new VaultDeniedError();
    return { kind, envelope: fromHex(row.data.payload_hex) };
  }
}

let port: IVaultPort | undefined;
/** The process-wide vault port. Swap the adapter here, nowhere else. */
export function vaultPort(): IVaultPort {
  port ??= new LocalPostgresVaultAdapter();
  return port;
}

/**
 * Reads a sealed envelope for the signed-in member. Requires the member's
 * fresh passkey step-up for "vault_token_read" (spent once, here and in the enclave).
 */
export async function readVaultEnvelope<K extends OpaqueTokenKind>(userId: string, ref: OpaqueToken<K>): Promise<VaultEnvelope<K>> {
  const { ensureStepUpProof, StepUpRequiredError } = await import("@/lib/auth/step-up.server");
  const { stepUpProofId } = await import("./step-up-proof-id");
  const proof = await ensureStepUpProof(userId, "vault_token_read");
  if (proof.method !== "passkey") throw new StepUpRequiredError();
  return vaultPort().retrieveToken({ userId }, ref, { verified: true, proofId: stepUpProofId(proof.jti) });
}
