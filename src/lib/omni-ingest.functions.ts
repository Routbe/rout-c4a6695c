import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/middleware";
import { ingestPayloadSchema, type OmniJob } from "@/lib/omni-ingest";

/** Studio: returns immediately with a job id; the dedicated daemon processes the persisted job. */
export const enqueueOmniUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => ingestPayloadSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; jobId?: string; error?: string }> => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("omni_ingest");
    const { enqueueOmniJob } = await import("@/lib/omni-ingest.server");
    try {
      return { ok: true, jobId: await enqueueOmniJob({ userId: context.userId, source: "studio", url: data.target_url, title: data.title, mediaUrl: data.media_url }) };
    } catch (e) {
      return { ok: false, error: (e as { status?: number }).status === 429 ? "rate_limited" : (e as Error).message === "host_not_allowed" ? "host_not_allowed" : "failed" };
    }
  });

export const listOmniIngestJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<OmniJob[]> => {
    const { listOmniJobs } = await import("@/lib/omni-ingest.server");
    return listOmniJobs(context.userId);
  });

export const dismissOmniJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`delete from public.omni_jobs where id=${data.id} and user_id=${context.userId} and status='failed'`;
    return { ok: true };
  });

export const retryOmniJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`update public.omni_jobs set status='queued', attempts=0, error=null, lease_token=null, next_attempt_at=now(), updated_at=now()
      where id=${data.id} and user_id=${context.userId} and status='failed'`;
    return { ok: true };
  });

export const getIngestTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ active: boolean; createdAt: string | null }> => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select created_at from public.omni_ingest_tokens where user_id=${context.userId}`) as { created_at: string }[];
    return { active: rows.length > 0, createdAt: rows[0] ? new Date(rows[0].created_at).toISOString() : null };
  });

/** Creates or rotates the webhook token. The raw token is shown once; only its SHA-256 is stored. */
export const rotateIngestToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ token: string }> => {
    const token = crypto.randomUUID();
    const { sha256Hex } = await import("@/lib/omni-ingest.server");
    const { sql } = await import("@/lib/neon");
    const hash = await sha256Hex(token);
    await sql`insert into public.omni_ingest_tokens (user_id, token_hash) values (${context.userId}, ${hash})
      on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now()`;
    return { token };
  });

export const revokeIngestToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`delete from public.omni_ingest_tokens where user_id=${context.userId}`;
    return { ok: true };
  });

/** A short-lived owner-scoped ticket; never expose worker/database credentials. */
export const getOmniRealtimeTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const endpoint = process.env["OMNI_EVENTS_URL"];
    const secret = process.env["OMNI_REALTIME_SECRET"];
    if (!endpoint || !secret) return { configured: false as const };
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/events") throw new Error("invalid_omni_events_url");
    const { signOmniTicket } = await import("@/lib/omni-realtime");
    return { configured: true as const, url: url.toString(), token: await signOmniTicket(context.userId, url.origin, secret) };
  });
