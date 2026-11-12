import { sql } from "./neon";

/** Only transport metadata: never endpoint URLs, request bodies or credentials. */
export async function recordOutboundWebhook(source: string, kind: string, status: number | null) {
  try {
    const id = `outbound:${crypto.randomUUID()}`;
    await sql`insert into public.webhook_events (id, source, kind, direction, http_status, status, completed_at)
      values (${id}, ${source}, ${kind}, 'outbound', ${status}, ${status != null && status >= 200 && status < 300 ? "done" : "failed"}, now())`;
  } catch (error) {
    console.error("[webhook-transport] recording failed", error);
  }
}