import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { CLAIM_JOB, COMPLETE_JOB, FAIL_JOB, HEARTBEAT_JOB, RECOVER_ZOMBIES } from "./queue";
import { prepare, removeObject, storage, upload, type ClaimedJob } from "./media";
import { EventHub } from "./events";

const url = process.env.OMNI_DATABASE_URL;
const secret = process.env.OMNI_REALTIME_SECRET;
const origin = process.env.OMNI_APP_ORIGIN;
const eventsUrl = process.env.OMNI_EVENTS_URL;
if (!url || !secret || secret.length < 32 || !origin || !eventsUrl) throw new Error("worker_configuration_missing");
const appOrigin = new URL(origin);
const eventEndpoint = new URL(eventsUrl);
if (appOrigin.protocol !== "https:" || appOrigin.origin !== origin || eventEndpoint.protocol !== "https:" || eventEndpoint.pathname !== "/events") throw new Error("invalid_worker_origins");
// This is a separate VPS process, NOT the webapp's Neon HTTP connector.
// Use unpooled PostgreSQL. The connector cannot provide a TCP LISTEN session.
const db = postgres(url, { max: 3, ssl: "require", connection: { application_name: "rout-omni-worker" } });
const listener = postgres(url, { max: 1, ssl: "require", connection: { application_name: "rout-omni-listener" } });
storage();
const role = await db`select r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'rout_omni_worker','member') as member,
 exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and pg_has_role(current_user,c.relowner,'usage')) as owns_tables
 from pg_roles r where r.rolname=current_user`;
if (!role[0]?.member || role[0]?.rolsuper || role[0]?.rolbypassrls || role[0]?.owns_tables) throw new Error("unsafe_worker_role");

const hub = new EventHub();
const server = Bun.serve({ hostname: process.env.HOST || "127.0.0.1", port: Number(process.env.PORT || 8090), idleTimeout: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ ok: true });
    if (path !== "/events") return new Response(null, { status: 404 });
    return hub.handle(request, origin, new URL(eventsUrl).origin, secret);
  },
});
let stopping = false; let draining = false; let rerun = false;
async function processJob(job: ClaimedJob) {
  let leaseLost = false; let heartbeatBusy = false;
  const timer = setInterval(async () => {
    if (heartbeatBusy) return; heartbeatBusy = true;
    try { const rows = await db.unsafe(HEARTBEAT_JOB, [job.id, job.lease_token]); if (!rows.length) leaseLost = true; }
    catch { leaseLost = true; } finally { heartbeatBusy = false; }
  }, 30_000);
  const uploaded: string[] = [];
  try {
    const media = await prepare(job);
    if (leaseLost) return;
    // Lease-specific immutable keys fence stale workers and make cleanup safe.
    const prefix = `${job.user_id}/omni-${job.id}-${job.lease_token}`;
    const cover = `${prefix}-cover.webp`;
    const kinetic = media.kinetic ? `${prefix}-kinetic.webm` : null;
    uploaded.push(`users/${cover}`); await upload(`users/${cover}`, media.cover, "image/webp");
    if (kinetic && media.kinetic) { uploaded.push(`users/${kinetic}`); await upload(`users/${kinetic}`, media.kinetic, "video/webm"); }
    if (leaseLost) throw new Error("lease_lost");
    const result = await db.unsafe(COMPLETE_JOB, [job.id, job.lease_token, media.type, media.title, media.meta, cover, kinetic]);
    if (!result.length) throw new Error("lease_lost");
    uploaded.length = 0;
  } catch (error) {
    // Never log URLs, tokens or raw provider responses.
    console.error("[omni] processing failed", { id: job.id });
    // Ambiguous completion: read back before deleting objects or retrying.
    let current;
    try { current = await db`select status,local_media_path from public.omni_jobs where id=${job.id} limit 1`; }
    catch {
      // Preserve potentially committed objects if readback itself is unavailable.
      uploaded.length = 0;
      throw new Error("completion_readback_unavailable");
    }
    if (current[0]?.status === "ready" && uploaded.includes(`users/${current[0]?.local_media_path}`)) uploaded.length = 0;
    else {
      const code = error instanceof Error && /^(no_image|unsafe|too_large|lease_lost)$/.test(error.message) ? error.message : "processing_failed";
      await db.unsafe(FAIL_JOB, [job.id, job.lease_token, code]);
    }
  } finally {
    clearInterval(timer);
    for (const key of uploaded) { try { await removeObject(key); } catch { console.error("[omni] cleanup pending", { id: job.id }); } }
  }
}
async function drain() {
  if (draining) { rerun = true; return; }
  draining = true;
  try {
    do {
      rerun = false;
      while (!stopping) {
        const rows = await db.unsafe<ClaimedJob[]>(CLAIM_JOB, [randomUUID()]);
        const job = rows[0]; if (!job) break;
        await processJob(job);
      }
    } while (rerun && !stopping);
  } catch { console.error("[omni] queue temporarily unavailable"); }
  finally { draining = false; }
}
// postgres.js maintains/reconnects its reserved LISTEN connection.
await listener.listen("new_omni_job", () => { void drain(); }, () => { void drain(); });
await listener.listen("omni_job_changed", (payload) => {
  try { const event = JSON.parse(payload); if (typeof event.userId === "string" && typeof event.id === "string") hub.publish(event.userId, event.id); } catch {}
}, () => hub.reconcile());
// Startup/recovery reconciles missed notifications. NOT the normal dispatch path.
async function recover() { try { await db.unsafe(RECOVER_ZOMBIES); await drain(); } catch { console.error("[omni] recovery unavailable"); } }
await recover();
const recovery = setInterval(() => { void recover(); }, 30_000);
async function shutdown() {
  stopping = true; clearInterval(recovery); server.stop(true);
  while (draining) await new Promise((resolve) => setTimeout(resolve, 100));
  await listener.end(); await db.end(); process.exit(0);
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });