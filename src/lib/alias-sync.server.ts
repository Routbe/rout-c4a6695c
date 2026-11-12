/**
 * Resilient background sync engine for ImprovMX alias operations.
 *
 * Admin actions never call ImprovMX inline: they enqueue a job in
 * `alias_sync_jobs` and immediately try to drain it. Rate limits and network
 * failures are retried (up to `max_attempts`, default 3), and the per-user
 * status is mirrored on `profiles.alias_sync_status` so the admin UI can show
 * Synced 🟢 / Pending Sync 🟡 / Sync Failed 🔴 with a last-updated timestamp.
 */
import { sql } from "@/lib/neon";

export type AliasSyncAction = "provision" | "rename" | "pause" | "resume" | "delete" | "freeze";

export type AliasSyncStatus = "synced" | "pending" | "failed";

const MAX_ATTEMPTS = 3;

type JobRow = {
  id: string;
  user_id: string;
  action: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

type Row = Record<string, unknown>;

async function markProfile(
  userId: string,
  status: AliasSyncStatus,
  attempts: number,
  error: string | null,
) {
  await sql`
    update public.profiles
       set alias_sync_status = ${status},
           alias_sync_attempts = ${attempts},
           alias_sync_error = ${error},
           alias_synced_at = now()
     where id = ${userId}
  `;
}

/** Queues one alias operation and marks the profile as "pending sync". */
export async function enqueueAliasJob(
  userId: string,
  action: AliasSyncAction,
  payload: Record<string, unknown> = {},
) {
  try {
    const rows = (await sql`
      insert into public.alias_sync_jobs (user_id, action, payload, max_attempts)
      values (${userId}, ${action}, ${JSON.stringify(payload)}, ${MAX_ATTEMPTS})
      returning id
    `) as Row[];
    await markProfile(userId, "pending", 0, null);
    return { ok: true as const, jobId: (rows[0]?.["id"] as string | undefined) ?? null };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : "insert failed" };
  }
}

/** Retryable failures: rate limits, timeouts and transient network errors. */
function isTransient(detail: string) {
  return /429|rate.?limit|timeout|ETIMEDOUT|ECONNRESET|fetch failed|50[0-4]/i.test(detail);
}

async function runJob(job: JobRow): Promise<{ ok: boolean; detail: string; retry: boolean }> {
  const alias = await import("./alias.server");
  try {
    let result;
    switch (job.action) {
      case "provision":
      case "resume":
        result = await alias.provisionAliasForUser(job.user_id);
        break;
      case "rename":
        result = await alias.renameAliasForUser(
          job.user_id,
          (job.payload["previousUsername"] as string | null) ?? null,
        );
        break;
      case "pause": {
        const username = (job.payload["username"] as string | undefined) ?? "";
        result = username
          ? await alias.pauseAlias(username)
          : ({ ok: false, reason: "no_username" } as const);
        break;
      }
      case "delete":
      case "freeze":
        result = await alias.freezeAliasForUser(job.user_id);
        break;
      default:
        return { ok: false, detail: `unknown action ${job.action}`, retry: false };
    }

    if (result.ok) return { ok: true, detail: "ok", retry: false };

    const detail = `${result.reason}${"detail" in result && result.detail ? `: ${result.detail}` : ""}`;
    // Missing key / handle / forward address, or a non-entitled (free) account
    // is terminal — retrying cannot help.
    const terminal = [
      "not_configured",
      "no_username",
      "no_forward",
      "not_found",
      "not_entitled",
    ].includes(result.reason);

    return { ok: false, detail, retry: !terminal && isTransient(detail) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { ok: false, detail, retry: isTransient(detail) };
  }
}

/**
 * Drains up to `limit` queued jobs. Safe to call repeatedly — it is invoked
 * right after every admin action and by the admin UI's refresh cycle.
 */
export async function drainAliasSyncQueue(limit = 10) {
  const data = (await sql`
    select id, user_id, action, payload, attempts, max_attempts
      from public.alias_sync_jobs
     where status = 'pending'
     order by created_at asc
     limit ${limit}
  `) as unknown as JobRow[];

  const jobs = data ?? [];
  let done = 0;
  let failed = 0;
  let retrying = 0;
  let lastError: string | null = null;

  for (const job of jobs) {
    const res = await runJob(job);
    const attempts = job.attempts + 1;
    const exhausted = attempts >= (job.max_attempts || MAX_ATTEMPTS);

    if (res.ok) {
      done += 1;

      await sql`
        update public.alias_sync_jobs
           set status = 'done', attempts = ${attempts}, last_error = null, updated_at = now()
         where id = ${job.id}
      `;

      await markProfile(job.user_id, "synced", attempts, null);
      continue;
    }

    lastError = res.detail;
    const giveUp = exhausted || !res.retry;
    if (giveUp) failed += 1;
    else retrying += 1;

    await sql`
      update public.alias_sync_jobs
         set status = ${giveUp ? "failed" : "pending"}, attempts = ${attempts},
             last_error = ${res.detail}, updated_at = now()
       where id = ${job.id}
    `;

    await markProfile(job.user_id, giveUp ? "failed" : "pending", attempts, res.detail);
  }

  return { processed: jobs.length, done, failed, retrying, lastError };
}

/** Requeues every failed job so an admin can retry after fixing the API key. */
export async function retryFailedAliasJobs() {
  await sql`
    update public.alias_sync_jobs
       set status = 'pending', attempts = 0, last_error = null, updated_at = now()
     where status = 'failed'
  `;
  return drainAliasSyncQueue(25);
}

/**
 * Targeted retry for a single account: its failed jobs are requeued (or a fresh
 * provision job is created) and drained immediately so the admin sees the real
 * ImprovMX error straight away.
 */
export async function requeueUserAlias(userId: string) {
  const existing = (await sql`
    select id from public.alias_sync_jobs
     where user_id = ${userId} and status in ('failed', 'pending')
     limit 1
  `) as Row[];

  if (existing.length > 0) {
    await sql`
      update public.alias_sync_jobs
         set status = 'pending', attempts = 0, last_error = null, updated_at = now()
       where user_id = ${userId} and status = 'failed'
    `;
  } else {
    await enqueueAliasJob(userId, "provision");
  }

  return drainAliasSyncQueue(10);
}

export type QueueSummary = { pending: number; failed: number; done: number };

export async function aliasQueueSummary(): Promise<QueueSummary> {
  const rows = (await sql`
    select status, count(*)::int as count
      from public.alias_sync_jobs
     where status in ('pending', 'failed', 'done')
     group by status
  `) as Row[];
  const summary: QueueSummary = { pending: 0, failed: 0, done: 0 };
  for (const row of rows) {
    const status = row["status"] as keyof QueueSummary;
    summary[status] = row["count"] as number;
  }
  return summary;
}
