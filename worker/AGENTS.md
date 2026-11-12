# Standalone Omni daemon
- Run on a real Bun/Linux host, never import this directory into TanStack routes or server functions. Why: Sharp, FFmpeg and persistent LISTEN need an OS process.
- PostgreSQL notifications are wake-up hints; public.omni_jobs is authoritative, with startup/reconnect/recovery reconciliation. Why: NOTIFY is not a durable queue.
- Claim locks commit before processing; lease tokens fence heartbeats and final writes. Why: crashes and duplicate wake-ups must not corrupt another worker's job.
- Source requests use DNS-pinned HTTPS and validate every redirect, conversion accepts local bounded files only. Why: prevent SSRF, DNS rebinding and FFmpeg network access.
- Keep secrets in deployment environment, never in images, source, URLs or logs. Why: the daemon's connection is independent of Lovable's connector credentials.
- Browser extraction requires Chromium sandbox support and exact approved source hosts; all HTTP resources pass through DNS-pinned transport and the browser's own proxy is blocked. Why: rendered scripts must not make native network requests or escape into the daemon host.
- Enforce OMNI_RENDER_HOSTS on every rendered resource and redirect hop before DNS lookup. Why: approved pages must not become arbitrary public-network relays.