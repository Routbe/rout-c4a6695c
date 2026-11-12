// Local base64 helpers: this file runs on the UI thread (WebAuthn is unavailable in
// workers) and must not pull the ledger crypto module into the main bundle.
import { captureEnclaveScope, enclave } from "@/lib/crypto-enclave/client";
import type { LedgerDraft } from "@/lib/crypto-enclave/client";
import type { PrivateEnvelope } from "./crypto";
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
type CallerScope = { signal: AbortSignal; assertCurrent: () => void };

/** Optional PRF only: unsupported authenticators never fall back to server-known secrets. */
async function ledgerPrf(credentialId?: string, scope?: CallerScope): Promise<{ output: Uint8Array; credentialId: string } | null> {
  const saltHex = await enclave.hash.sha256Hex("ROUT-ledger-private-key-PRF:v1");
  scope?.assertCurrent();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (hex) => parseInt(hex, 16));
  const extensions = { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs;
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: "required", timeout: 60000,
    ...(credentialId ? { allowCredentials: [{ type: "public-key" as const, id: fromBase64(credentialId) }] } : {}), extensions,
  }, signal: scope?.signal }) as PublicKeyCredential | null;
  if (!credential) return null;
  const results = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & { prf?: { results?: { first?: ArrayBuffer } } };
  const output = results.prf?.results?.first;
  return output ? { output: new Uint8Array(output), credentialId: toBase64(new Uint8Array(credential.rawId)) } : null;
}

/** WebAuthn requires the UI context; transfer its result before React can hold it. */
async function withPrf<T>(credentialId: string | undefined, consume: (output: Uint8Array, credentialId: string) => Promise<T>, caller?: CallerScope): Promise<T | null> {
  const scope = captureEnclaveScope();
  caller?.assertCurrent();
  const result = await ledgerPrf(credentialId, caller);
  if (!result) return null;
  try {
    scope.assertCurrent();
    caller?.assertCurrent();
    return await consume(result.output, result.credentialId);
  } finally {
    // Successful transfer already detached it; failed setup still gets zeroed.
    if (result.output.byteLength) result.output.fill(0);
  }
}

export function generateLedgerWithPasskey(caller?: CallerScope): Promise<{ draft: LedgerDraft; credentialId: string } | null> {
  return withPrf(undefined, async (output, credentialId) => ({ draft: await enclave.ledger.generate(output), credentialId }), caller);
}

export function unlockLedgerWithPasskey(keyId: string, envelope: PrivateEnvelope, credentialId?: string, caller?: CallerScope): Promise<boolean> {
  return withPrf(credentialId, async (output) => {
    await enclave.ledger.unlock(keyId, envelope, { prf: output });
    return true;
  }, caller).then((result) => result === true);
}