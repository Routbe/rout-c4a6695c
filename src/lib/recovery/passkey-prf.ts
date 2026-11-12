/**
 * UI-thread WebAuthn PRF for the recovery vault and pairwise partner IDs.
 * WebAuthn is unavailable in workers, so the PRF output is created here and
 * transferred straight into the crypto enclave (which wipes it). Each purpose
 * has its own PRF salt, so the ledger key, the shard key and the pairwise root
 * can never be derived from one another.
 */
import { captureEnclaveScope, enclave } from "@/lib/crypto-enclave/client";

export const PRF_PURPOSE = {
  shard: "ROUT-recovery-shard-PRF:v1",
  pairwise: "ROUT-pairwise-root-PRF:v1",
} as const;
export type PrfPurpose = keyof typeof PRF_PURPOSE;

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export class PrfUnsupportedError extends Error {
  constructor() {
    super("prf_unsupported");
  }
}

/** Runs `consume` with a fresh PRF output; no PRF = explicit error, never a weaker fallback. */
export async function withPasskeyPrf<T>(
  purpose: PrfPurpose,
  consume: (output: Uint8Array, credentialId: string) => Promise<T>,
  credentialId?: string,
): Promise<T> {
  const scope = captureEnclaveScope();
  const saltHex = await enclave.hash.sha256Hex(PRF_PURPOSE[purpose]);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: "required",
      timeout: 60000,
      ...(credentialId ? { allowCredentials: [{ type: "public-key" as const, id: fromBase64(credentialId) }] } : {}),
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new PrfUnsupportedError();
  const results = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & { prf?: { results?: { first?: ArrayBuffer } } };
  const first = results.prf?.results?.first;
  if (!first) throw new PrfUnsupportedError();
  const output = new Uint8Array(first);
  try {
    scope.assertCurrent();
    return await consume(output, toBase64(new Uint8Array(credential.rawId)));
  } finally {
    if (output.byteLength) output.fill(0);
  }
}
