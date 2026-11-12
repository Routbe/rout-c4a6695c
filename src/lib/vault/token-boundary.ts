/**
 * Token boundary: the only shape in which vault data may travel outside the
 * vault enclave. Browser code and every API surface handle these opaque
 * references, never the raw identifier (IBAN, national register number,
 * private key) or its ciphertext.
 *
 * Format: `<kind>_<64 lowercase hex>` — 256 random bits minted by the database
 * (vault_enclave.store_opaque_token, db/0221). The reference grants nothing on
 * its own: retrieval also needs the owner's session and a fresh passkey step-up.
 *
 * Validation is strict on purpose: exact length first (cheap, bounds input),
 * ASCII-only alphabet, lowercase only, no surrounding whitespace, no prefix
 * guessing. Errors never echo the input, so a mistyped secret can't reach logs.
 */
import { z } from "zod";

export const OPAQUE_TOKEN_KINDS = ["vtk", "vcc", "mpc", "sdm"] as const;
export type OpaqueTokenKind = (typeof OPAQUE_TOKEN_KINDS)[number];

/** What each kind holds; also the token_type stored in vault_enclave.opaque_tokens. */
export const OPAQUE_TOKEN_PURPOSE: Readonly<Record<OpaqueTokenKind, string>> = Object.freeze({
  vtk: "Vault Token Key: a regular sealed blob",
  vcc: "Verifiable Credential Claim: an SD-JWT (eIDAS 2.0) claim",
  mpc: "Multi-Party Shard: one share of a split key",
  sdm: "Secure Dynamic Messaging: NFC NTAG 424 DNA card material",
});

const BODY_HEX_LENGTH = 64;
/** Prefix (3) + underscore (1) + body (64). */
export const OPAQUE_TOKEN_LENGTH = 3 + 1 + BODY_HEX_LENGTH;

declare const opaqueTokenBrand: unique symbol;
/** A validated reference of kind K. Only this module can produce one. */
export type OpaqueToken<K extends OpaqueTokenKind = OpaqueTokenKind> = `${K}_${string}` & {
  readonly [opaqueTokenBrand]: K;
};
export type VaultTokenKey = OpaqueToken<"vtk">;
export type VerifiableCredentialClaim = OpaqueToken<"vcc">;
export type MultiPartyShard = OpaqueToken<"mpc">;
export type SecureDynamicMessaging = OpaqueToken<"sdm">;

const KIND_SET: ReadonlySet<string> = new Set(OPAQUE_TOKEN_KINDS);
const ANY_TOKEN_RE = /^(?:vtk|vcc|mpc|sdm)_[0-9a-f]{64}$/;
const KIND_RE: Readonly<Record<OpaqueTokenKind, RegExp>> = Object.freeze({
  vtk: /^vtk_[0-9a-f]{64}$/,
  vcc: /^vcc_[0-9a-f]{64}$/,
  mpc: /^mpc_[0-9a-f]{64}$/,
  sdm: /^sdm_[0-9a-f]{64}$/,
});

export const OPAQUE_TOKEN_INVALID = "opaque_token_invalid";

function matches(value: unknown, re: RegExp): value is string {
  return typeof value === "string" && value.length === OPAQUE_TOKEN_LENGTH && re.test(value);
}

/** True for a well-formed reference of any kind (or of `kind`, when given). */
export function isOpaqueToken<K extends OpaqueTokenKind>(value: unknown, kind?: K): value is OpaqueToken<K> {
  return matches(value, kind ? KIND_RE[kind] : ANY_TOKEN_RE);
}

/** The kind of a validated reference. */
export function opaqueTokenKind<K extends OpaqueTokenKind>(token: OpaqueToken<K>): K {
  const kind = token.slice(0, 3);
  if (!KIND_SET.has(kind)) throw new TypeError(OPAQUE_TOKEN_INVALID);
  return kind as K;
}

/** Zod schema accepting only references of `kind`. */
export function opaqueTokenSchema<K extends OpaqueTokenKind>(kind: K) {
  const re = KIND_RE[kind];
  return z
    .custom<OpaqueToken<K>>((value) => matches(value, re), { error: OPAQUE_TOKEN_INVALID })
    .readonly();
}

/** Zod schema accepting a reference of any of the four kinds. */
export const AnyOpaqueTokenSchema = z
  .custom<OpaqueToken>((value) => matches(value, ANY_TOKEN_RE), { error: OPAQUE_TOKEN_INVALID })
  .readonly();

export const VaultTokenKeySchema = opaqueTokenSchema("vtk");
export const VerifiableCredentialClaimSchema = opaqueTokenSchema("vcc");
export const MultiPartyShardSchema = opaqueTokenSchema("mpc");
export const SecureDynamicMessagingSchema = opaqueTokenSchema("sdm");

export class OpaqueTokenError extends Error {
  constructor() {
    super(OPAQUE_TOKEN_INVALID);
    this.name = "OpaqueTokenError";
  }
}

/** Parses untrusted input; throws OpaqueTokenError (never echoing the input). */
export function parseOpaqueToken(value: unknown): OpaqueToken;
export function parseOpaqueToken<K extends OpaqueTokenKind>(value: unknown, kind: K): OpaqueToken<K>;
export function parseOpaqueToken<K extends OpaqueTokenKind>(value: unknown, kind?: K): OpaqueToken<K> {
  if (!isOpaqueToken(value, kind)) throw new OpaqueTokenError();
  return value;
}
