import { GENESIS_HASH, sha256Hex } from "@/lib/audit-chain";
export type DisclosureEntry = { id: string; userId: string; clientId: string; scopes: string[]; timestamp: string; previousHash: string; entryHash: string };
export function disclosureInput(row: DisclosureEntry) {
  // Length-prefixed fields avoid separator ambiguity and match the DB trigger.
  const fields = [row.previousHash, row.userId, row.clientId, ...row.scopes, row.timestamp];
  return fields.map((s) => `${new TextEncoder().encode(s).length}:${s}`).join("");
}
export async function verifyDisclosureChain(rows: DisclosureEntry[], expectedHead?: string) {
  let previous = GENESIS_HASH;
  for (const row of rows) {
    if (row.previousHash !== previous || await sha256Hex(disclosureInput(row)) !== row.entryHash) return { verified: false, brokenId: row.id, head: previous };
    previous = row.entryHash;
  }
  return { verified: expectedHead === undefined || previous === expectedHead, brokenId: null, head: previous };
}
/** RFC6962-style domain-separated Merkle root; duplicate no leaves. */
export async function merkleRoot(hashes: string[]): Promise<string> {
  const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (b) => b.toString(16).padStart(2, "0")).join("");
  const bytes = (s: string) => {
    if (!/^[a-f0-9]{64}$/.test(s)) throw new Error("Invalid leaf hash");
    return Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
  };
  if (!hashes.length) return digest(new Uint8Array());
  if (hashes.length === 1) return digest(new Uint8Array([0, ...bytes(hashes[0])]));
  const split = 2 ** Math.floor(Math.log2(hashes.length - 1));
  const [left, right] = await Promise.all([merkleRoot(hashes.slice(0, split)), merkleRoot(hashes.slice(split))]);
  return digest(new Uint8Array([1, ...bytes(left), ...bytes(right)]));
}