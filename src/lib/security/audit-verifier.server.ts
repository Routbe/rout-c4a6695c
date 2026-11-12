import { merkleRoot, verifyDisclosureChain, type DisclosureEntry } from "./disclosure-chain";
/** Bounded background/on-demand verification. Overflow is unverified, never a green shield. */
export async function verifyUserDisclosures(userId: string) {
  const { sql } = await import("@/lib/neon");
  const snapshot = await sql`select u.latest_audit_hash,
    (select coalesce(jsonb_agg(to_jsonb(l) order by l.timestamp,l.id),'[]'::jsonb) from
      (select id, user_id, client_id, disclosed_scopes,
    to_char(disclosed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as timestamp,
    previous_hash, entry_hash from public.identity_disclosure_logs where user_id = ${userId}
    order by disclosed_at, id limit 10001) l) as entries
    from public.users u where u.id=${userId}`;
  const head = snapshot[0]?.latest_audit_hash;
  const value = snapshot[0]?.entries;
  if (!Array.isArray(value)) return { verified: false, reason: "invalid_snapshot", rows: [], merkleRoot: null };
  const raw = value as Record<string, unknown>[];
  if (raw.length > 10000) return { verified: false, reason: "verification_limit", rows: [], merkleRoot: null };
  const entries: DisclosureEntry[] = raw.map((r) => ({ id: String(r["id"]), userId: String(r["user_id"]), clientId: String(r["client_id"]),
    scopes: r["disclosed_scopes"] as string[], timestamp: String(r["timestamp"]), previousHash: String(r["previous_hash"]), entryHash: String(r["entry_hash"]) }));
  if (typeof head !== "string" || !/^[a-f0-9]{64}$/.test(head)) {
    return { verified: false, reason: entries.length ? "missing_head" : "empty", rows: [], merkleRoot: null };
  }
  const result = await verifyDisclosureChain(entries, head);
  return { verified: result.verified && entries.length > 0, reason: !entries.length ? "truncated_chain" : result.verified ? null : "broken_chain", merkleRoot: entries.length ? await merkleRoot(entries.map((r) => r.entryHash)) : null,
    rows: entries.slice(-50).reverse().map(({ id, clientId, scopes, timestamp }) => ({ id, clientId, scopes, timestamp })) };
}