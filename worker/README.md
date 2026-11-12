# ROUT Omni persistent daemon

This service is implemented independently of the TanStack request runtime. It
does not deploy with Lovable's webapp. Deploy it on a persistent European Linux
VPS/container host; put `/events` behind HTTPS with proxy buffering disabled.

## Provisioning (required before production use)

1. Review/apply `db/0188_omni_ingest.sql`, then `db/0189_omni_worker.sql` and
   `db/0190_omni_semantic_catalog.sql` via a DBA (0184 draft index must exist).
   The second migration renames the existing table without discarding jobs.
2. A DBA creates a dedicated LOGIN with a securely chosen password and grants
   only `rout_omni_worker`. Do not use a database owner, BYPASSRLS role or
   console-created unrestricted Neon role. This service fails closed on unsafe
   roles. Do not put connection strings in chat or source.
3. Set `OMNI_DATABASE_URL` **on the VPS only** to an unpooled TCP PostgreSQL
   endpoint. A transaction pooler and Lovable's Neon HTTP connector cannot
   maintain `LISTEN`. No connector credential is used as a database URL.
4. Set these worker deployment environment values:
   - `OMNI_REALTIME_SECRET`: random shared secret, at least 32 characters.
   - `OMNI_APP_ORIGIN`: exact HTTPS origin of the ROUT webapp.
   - `OMNI_EVENTS_URL`: HTTPS daemon URL ending in `/events`.
   - `SCALEWAY_ACCESS_KEY`, `SCALEWAY_SECRET_KEY`, `SCALEWAY_CLIENT_BUCKET`.
   - Optional `SCALEWAY_REGION` (`fr-par` default), `SCALEWAY_ENDPOINT`, `PORT`, `HOST`.
     The process binds loopback by default; Docker binds `0.0.0.0` behind your proxy.
   Keep the client bucket private; restrict its keys to `users/`. The worker
   requires PUT/DELETE and the webapp requires GET to the same bucket.
5. Configure the same `OMNI_REALTIME_SECRET`, `OMNI_EVENTS_URL` and Scaleway
   storage settings in the webapp's server environment. No frontend secret.
6. Run `bun install --cwd worker`, then `bun run worker/main.ts`. FFmpeg must
   be installed. For Docker, build from the repository root with
   `docker build -f worker/Dockerfile .`; use a clean staging context excluding
   repository metadata, environment files and dependency folders.

## Guarantees and limits

- INSERT/status triggers notify `new_omni_job` and `omni_job_changed` at commit.
- Atomic SKIP LOCKED claims release row locks before downloads/conversion.
- Heartbeats every 30 seconds; jobs inactive for five minutes are recovered.
- Three attempts, delayed retries, lease-fenced writes and lease-specific keys.
- Heartbeats run independently of downloads/conversion. If database connectivity
  is lost the worker stops publishing results, preserves ambiguous commits, and
  the lease permits another worker to recover. Configure container restart and
  private-bucket orphan lifecycle cleanup; SIGKILL cannot execute cleanup.
- A 30-second recovery sweep also catches delayed retries and missed messages;
  ordinary dispatch and Studio updates are event-driven, not inbox polling.
- Reconnecting SSE reads the authenticated inbox to catch missed events. The
  ticket expires after five minutes and is renewed through the webapp session.
- Native code performs bounded source fetching, WebP conversion and six-second
  muted WebM previews for directly downloadable MP4/WebM. FFmpeg is killed after
  60 seconds to prevent malformed inputs monopolizing the daemon.
- Optional SPA rendering: set `OMNI_RENDER_HOSTS` to comma-separated exact
  approved hostnames and install Chromium (`CHROMIUM_PATH` optional). Docker
  includes Chromium. All network resources are fulfilled through DNS-pinned
  HTTPS transport; service workers, sockets, images, media and popups are blocked.
  The exact host allowlist applies to every resource and redirect before DNS
  resolution; enumerate required script/API hosts explicitly, never wildcards.
  A dead proxy prevents unhandled direct egress. Browser output is only metadata.
  Run browser processes with OS sandboxing/resource limits and a restricted
  network policy; never add `--no-sandbox`. This does not bypass CAPTCHAs,
  authenticated pages or platform restrictions; explicit media hints still work
  when the source page is blocked. Provider player streams are not downloaded.
  Chromium sandboxing is explicitly enabled; run as a non-root user on a host
  with user namespaces/sandbox support. If unavailable, extraction falls back
  to static metadata instead of disabling the sandbox.
  The sandbox's root-only environment cannot validate this hardened browser
  launch; run `CHROMIUM_PATH=... bun test render.test.ts` as a non-root worker
  user on the deployment host before enabling approved render hosts.
  Entries are parsed strictly (`render-hosts.ts`): wildcards, schemes, ports,
  paths, IP addresses and internal names are dropped and logged once. A tested
  starting value for the platforms the Studio recognises:
  `OMNI_RENDER_HOSTS=www.youtube.com,m.youtube.com,youtu.be,www.tiktok.com,www.instagram.com,x.com,twitter.com,bsky.app,open.spotify.com,music.apple.com,soundcloud.com,www.deezer.com,vimeo.com,www.twitch.tv`
  — add a platform's script/API hosts only after `render.test.ts` passes on the host.
- `omni_matrix_items` is an owner-only semantic draft projection; `grid_items`
  and `ingest_tokens` are compatibility views. Public cards still use published
  snapshots. UUID webhook tokens are stored only as SHA-256 hashes, not plaintext
  in user_settings. Existing high-entropy tokens remain accepted until rotation.
- `/api/ingest/grid` and `/api/ingest/omni` are compatibility routes. Use the
  `/api/public/ingest/*` URLs for external callers on published Lovable sites.
- There is no serverless job execution deadline. Source requests have safety
  deadlines and size limits; container resource limits remain necessary.
- The API waits for authorization and durable insertion, not media work. A
  **<50ms end-to-end response is not guaranteed** with remote HTTP database
  transport or cold starts; measure in the deployed environment.
- This does not certify Neon/Lovable or the overall stack as 100% sovereign.

## Acceptance check after deployment

Sign into Studio, import a real HTTPS URL, verify `202/job_id`, observe the
SSE-driven ready card, add it to the private draft and confirm anonymous media
access is denied. Publish through the existing profile flow; verify that the
same first-party media URL renders for visitors. Kill a worker during a job,
restart and verify five-minute recovery. Run a second worker and confirm only
one lease wins per job. No live deployment or credentials are supplied here.