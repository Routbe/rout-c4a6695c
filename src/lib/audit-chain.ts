/**
 * Pure rules for the hash-chained security audit log (db/0127).
 * Mirrors the database trigger formula so chains and checkpoints can be verified locally.
 */
export const GENESIS_HASH = "0".repeat(64);
export const AUDIT_RETENTION_DAYS = 365;

export interface AuditRow {
  id: number;
  eventType: string;
  userId: string | null;
  actorId: string | null;
  /** Exactly as Postgres renders jsonb::text. */
  payloadText: string;
  prevHash: string;
  currentHash: string;
  /** ISO UTC with milliseconds, e.g. 2026-10-30T16:48:00.000Z */
  createdAt: string;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function chainInput(prevHash: string, r: Omit<AuditRow, "id" | "prevHash" | "currentHash">): string {
  return [prevHash, r.eventType, r.userId ?? "", r.actorId ?? "", r.payloadText, r.createdAt].join("|");
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hmacSha256Hex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

/** Returns the id of the first broken row, or null when the chain is intact. */
export async function verifyChain(rows: AuditRow[], startHash?: string): Promise<number | null> {
  let prev = startHash ?? rows[0]?.prevHash ?? GENESIS_HASH;
  for (const r of rows) {
    if (r.prevHash !== prev) return r.id;
    if ((await sha256Hex(chainInput(prev, r))) !== r.currentHash) return r.id;
    prev = r.currentHash;
  }
  return null;
}

export function checkpointMessage(cp: { day: string; lastId: number; lastHash: string; rowCount: number }): string {
  return `rout-audit-checkpoint:v1|${cp.day}|${cp.lastId}|${cp.lastHash}|${cp.rowCount}`;
}
