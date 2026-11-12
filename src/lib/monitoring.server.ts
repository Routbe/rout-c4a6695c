import { safeOrTerm } from "@/lib/db/search-term";
/**
 * Server-only reads for the admin webhook monitor and referral analytics.
 * Service-role access: the monitor table carries raw Stripe payloads and is
 * never exposed to the browser directly.
 */

export interface WebhookEventRow {
  id: string;
  source: string;
  kind: string | null;
  status: string;
  outcome: string | null;
  idempotency_key: string | null;
  attempts: number;
  error: string | null;
  /** Raw event, pre-serialized to JSON text so it crosses the RPC boundary. */
  payload: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function fetchWebhookEvents(opts: {
  limit?: number;
  status?: string | null;
  search?: string | null;
}): Promise<WebhookEventRow[]> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  let query = dbAdmin
    .from("webhook_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));

  if (opts.status && opts.status !== "all") query = query.eq("status" as "id", opts.status);
  if (opts.search) {
    const term = safeOrTerm(opts.search);
    if (term) query = query.or(`id.ilike.%${term}%,kind.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("webhook events read failed", error);
    return [];
  }
  return (
    (data ?? []) as unknown as (Omit<WebhookEventRow, "payload"> & { payload?: unknown })[]
  ).map((row) => ({
    ...row,
    payload: row.payload == null ? null : JSON.stringify(row.payload, null, 2),
  }));
}

/**
 * Referral totals for one member: only the number of sign-ups that used their
 * invite. No visit logging, no referer, no visitor metadata whatsoever.
 */
export async function fetchReferralAnalytics(userId: string, _handle: string | null) {
  const { dbAdmin } = await import("@/lib/db/admin.server");

  const { data: profile } = await dbAdmin
    .from("profiles")
    .select("invited_count" as "*")
    .eq("id", userId)
    .maybeSingle();
  const signups = Number((profile as Record<string, unknown> | null)?.["invited_count"] ?? 0);

  return { signups };
}
