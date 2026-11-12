/** Outbound webhooks: enqueue + signed delivery with exponential backoff (db/0129). */
import { sql } from "@/lib/neon";
import { MAX_ATTEMPTS, SIGNATURE_HEADER, nextRetryDelaySec, signWebhook } from "./signature";

export async function enqueueWebhookEvent(ownerUserId: string, eventType: string, payload: Record<string, unknown>) {
  await sql`insert into public.webhook_deliveries (endpoint_id, event_type, payload_json)
    select id, ${eventType}, ${JSON.stringify(payload)}::jsonb from public.webhook_endpoints
     where owner_user_id = ${ownerUserId} and active and (${eventType} = any(events) or cardinality(events) = 0)`;
}

/** Delivers due rows; called by the cron route. Returns counts only. */
export async function deliverDueWebhooks(limit = 50) {
  const { open } = await import("@/lib/crypto/secretbox.server");
  const rows = (await sql`select d.id, d.event_type, d.payload_json, d.attempts, e.url, e.secret_ciphertext, e.secret_iv, e.id as endpoint_id
      from public.webhook_deliveries d join public.webhook_endpoints e on e.id = d.endpoint_id
     where d.delivered_at is null and d.failed_at is null and d.next_attempt_at <= now() and e.active
     order by d.next_attempt_at limit ${limit}`) as Record<string, unknown>[];
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  for (const r of rows) {
    const attempts = Number(r["attempts"]) + 1;
    let status = 0;
    try {
      const secret = await open(String(r["secret_ciphertext"]), String(r["secret_iv"]), `webhook:${String(r["endpoint_id"])}`);
      const body = JSON.stringify({ id: r["id"], type: r["event_type"], data: r["payload_json"] });
      const res = await fetch(String(r["url"]), {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json", [SIGNATURE_HEADER]: await signWebhook(secret, body, Math.floor(Date.now() / 1000)) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) {
      delivered++;
      await sql`update public.webhook_deliveries set attempts = ${attempts}, last_status = ${status}, delivered_at = now() where id = ${r["id"]}`;
      continue;
    }
    const delay = nextRetryDelaySec(attempts);
    if (delay === null || attempts >= MAX_ATTEMPTS) {
      failed++;
      await sql`update public.webhook_deliveries set attempts = ${attempts}, last_status = ${status}, failed_at = now() where id = ${r["id"]}`;
    } else {
      retried++;
      await sql`update public.webhook_deliveries set attempts = ${attempts}, last_status = ${status},
        next_attempt_at = now() + make_interval(secs => ${delay}) where id = ${r["id"]}`;
    }
  }
  return { delivered, retried, failed };
}
