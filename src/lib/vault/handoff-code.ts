/**
 * Handoff code format, crypto-free so UI pages can parse a pasted code without
 * pulling vault cryptography into the main bundle (that lives in the enclave).
 */
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
const HANDOFF_RE = /rvh1_([0-9a-f]{32})_([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/;

/** One string a human can paste or scan: `rvh1_<vault id hex>_<secret>`. */
export function handoffCode(vaultId: string, secret: string): string {
  const hex = vaultId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex) || !SECRET_RE.test(secret)) throw new Error("invalid_handoff_parts");
  return `rvh1_${hex}_${secret}`;
}

/** Finds a handoff code in raw input or a claim URL (`…/claim#rvh1_…`). */
export function parseHandoffCode(input: string): { vaultId: string; secret: string } | null {
  const m = HANDOFF_RE.exec(input.trim());
  if (!m) return null;
  const h = m[1];
  const vaultId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { vaultId, secret: m[2] };
}
