/**
 * The AAD context every RVE1 envelope is bound to: which member, which token
 * kind and which purpose (field). Built in one place so the browser worker and
 * the server vault can never disagree about it.
 */
import type { OpaqueTokenKind } from "./token-boundary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PURPOSE_RE = /^[a-z][a-z0-9_.-]{0,63}$/;

export class VaultContextError extends Error {
  constructor() {
    super("vault_context_invalid");
    this.name = "VaultContextError";
  }
}

export function vaultContext(userId: string, kind: OpaqueTokenKind, purpose: string): string {
  if (!UUID_RE.test(userId) || !PURPOSE_RE.test(purpose)) throw new VaultContextError();
  return `rout.vault.v1|${userId}|${kind}|${purpose}`;
}
