/**
 * Server vault for vtk_ and sdm_ (the kinds whose key holder is the server).
 *
 * Sealing: plaintext -> RVE1 envelope for the active server recipient key ->
 * vault_enclave via the port -> a database-minted opaque reference.
 * Opening: envelope (from the port) -> the recipient key's wrapped seed (db/0222)
 * -> AES-256-GCM unwrap under ROUT_VAULT_KEK -> RVE1 open -> plaintext.
 *
 * The KEK is read from the environment per call and disposed afterwards; the
 * unwrapped seed exists only inside openWithServerKey. A key whose wrap does
 * not authenticate under the KEK, or whose seed does not reproduce its key id,
 * is never used: sealing and opening then fail closed with VaultDeniedError.
 * The caller owns (and must wipe) plaintext it passes in or gets back.
 */
import { envelopeKeyId, generateRecipientKeys, keyId, openEnvelope, publicKeyOf, sealEnvelope } from "@/lib/crypto-enclave/pqc-envelope";
import { deriveVaultKek, type VaultKek } from "./server-kek";
import type { OpaqueToken } from "./token-boundary";
import { vaultContext } from "./vault-context";
import { readVaultEnvelope, VaultDeniedError, vaultPort, type IVaultPort, type VaultCaller, type WrappedServerKey } from "./vault-port.server";

export type ServerTokenKind = "vtk" | "sdm";

export class VaultKekMissingError extends Error {
  constructor() {
    super("vault_kek_missing");
    this.name = "VaultKekMissingError";
  }
}

/** Reads ROUT_VAULT_KEK at call time (never at module scope). */
export function vaultKekFromEnv(): VaultKek {
  const secret = process.env["ROUT_VAULT_KEK"];
  if (!secret) throw new VaultKekMissingError();
  return deriveVaultKek(secret);
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

/** Unwraps a stored key and checks it is genuine; the seed is wiped before returning. */
function withServerSeed<T>(kek: VaultKek, key: WrappedServerKey, use: (seed: Uint8Array) => T): T {
  let seed: Uint8Array | undefined;
  let derived: Uint8Array | undefined;
  try {
    seed = kek.unwrap(key.kid, key.wrappedSeed);
    derived = publicKeyOf(seed);
    if (!same(keyId(derived), key.kid) || !same(derived, key.publicKey)) throw new VaultDeniedError();
    return use(seed);
  } catch (error) {
    throw error instanceof VaultDeniedError ? error : new VaultDeniedError();
  } finally {
    seed?.fill(0);
    derived?.fill(0);
  }
}

/** The verified public key that new envelopes are sealed to; creates the first one. */
async function activeRecipient(port: IVaultPort, caller: VaultCaller, kek: VaultKek): Promise<Uint8Array> {
  let key = await port.activeServerKey(caller);
  if (!key) {
    const fresh = generateRecipientKeys("server_vault");
    try {
      const candidate = { kid: fresh.kid, publicKey: fresh.publicKey, wrappedSeed: kek.wrap(fresh.kid, fresh.secretKey), kekId: kek.kekId };
      key = (await port.registerServerKey(caller, candidate)) ? candidate : await port.activeServerKey(caller);
    } finally {
      fresh.secretKey.fill(0);
    }
    if (!key) throw new VaultDeniedError();
  }
  const verified = key;
  withServerSeed(kek, verified, () => undefined);
  return verified.publicKey;
}

/** Seals `plaintext` for the server vault and stores it; returns the opaque reference. */
export async function sealServerToken<K extends ServerTokenKind>(
  userId: string,
  kind: K,
  purpose: string,
  plaintext: Uint8Array,
  deps: { port?: IVaultPort; kek?: VaultKek } = {},
): Promise<OpaqueToken<K>> {
  const port = deps.port ?? vaultPort();
  const kek = deps.kek ?? vaultKekFromEnv();
  const caller = { userId };
  try {
    const context = vaultContext(userId, kind, purpose);
    const recipientPublicKey = await activeRecipient(port, caller, kek);
    const envelope = sealEnvelope({ kind, holder: "server_vault", recipientPublicKey, plaintext, context });
    return await port.storeToken(caller, kind, envelope);
  } finally {
    if (!deps.kek) kek.dispose();
  }
}

/** Opens an envelope the vault returned for this member. The plaintext is the caller's to wipe. */
export async function openWithServerKey(
  userId: string,
  kind: ServerTokenKind,
  purpose: string,
  envelope: Uint8Array,
  deps: { port?: IVaultPort; kek?: VaultKek } = {},
): Promise<Uint8Array> {
  const port = deps.port ?? vaultPort();
  const kek = deps.kek ?? vaultKekFromEnv();
  try {
    const context = vaultContext(userId, kind, purpose);
    const key = await port.serverKey({ userId }, envelopeKeyId(envelope));
    if (!key) throw new VaultDeniedError();
    return withServerSeed(kek, key, (secretKey) =>
      openEnvelope({ envelope, expectedKind: kind, holder: "server_vault", secretKey, context }),
    );
  } catch (error) {
    throw error instanceof VaultDeniedError ? error : new VaultDeniedError();
  } finally {
    if (!deps.kek) kek.dispose();
  }
}

/** Reads and opens a vtk_ token: needs the member's fresh passkey step-up (spent once). */
export async function openServerToken(userId: string, ref: OpaqueToken<"vtk">, purpose: string): Promise<Uint8Array> {
  const { envelope } = await readVaultEnvelope(userId, ref);
  return openWithServerKey(userId, "vtk", purpose, envelope);
}
