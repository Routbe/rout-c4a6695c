<div align="center">

<img src="public/img/logo.svg" alt="ROUT" width="88" />

# ROUT

### Sovereign Digital Identity OS

**Your digital identity. Under your control.**

European infrastructure for digital identity, physical access, communication and routing.
Privacy by design. Passkeys and cryptographic cards connect your digital and physical worlds.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-0f766e.svg)](LICENSE)
![TanStack Start](https://img.shields.io/badge/TanStack%20Start-1.168-111827)
![React](https://img.shields.io/badge/React-19-149eca)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791)
![Auth](https://img.shields.io/badge/auth-passkeys%20only-16a34a)
![i18n](https://img.shields.io/badge/i18n-NL%20%C2%B7%20EN%20%C2%B7%20FR%20%C2%B7%20DE-6b7280)
![Hosting](https://img.shields.io/badge/data-EU%20only-1d4ed8)

[Product](#-what-rout-is) ·
[Architecture](#-architecture) ·
[Security model](#-security-model) ·
[Getting started](#-getting-started) ·
[Database](#-database) ·
[Deployment](#-deployment) ·
[Contributing](#-contributing)

</div>

---

## Table of contents

1. [What ROUT is](#-what-rout-is)
2. [Feature map](#-feature-map)
3. [At a glance](#-at-a-glance)
4. [Tech stack](#-tech-stack)
5. [Architecture](#-architecture)
6. [Repository layout](#-repository-layout)
7. [Security model](#-security-model)
8. [Getting started](#-getting-started)
9. [Configuration](#-configuration)
10. [Database](#-database)
11. [The Omni worker](#-the-omni-worker)
12. [Public & machine-readable endpoints](#-public--machine-readable-endpoints)
13. [Scheduled jobs](#-scheduled-jobs)
14. [Internationalisation](#-internationalisation)
15. [Content & documentation pages](#-content--documentation-pages)
16. [Testing & quality](#-testing--quality)
17. [Deployment](#-deployment)
18. [Operations runbook](#-operations-runbook)
19. [Contributing](#-contributing)
20. [License](#-license)

---

## 🧭 What ROUT is

ROUT is a **sovereign identity operating system**. It starts as more than a link in your bio and grows into a full identity layer. One person (or organisation) gets one verifiable, self-controlled presence that works across the open web and in the physical world:

- a **public profile** at `rout.be/@handle` (or `rout.be/u/handle`) with links, media, bookings, tips, Q&A and live presence;
- a **ROUT ID**: a standards-compliant **OpenID Connect provider** ("Sign in with ROUT") with pairwise subjects, selective disclosure and a private email relay;
- a **ROUT Card**: NFC/QR hardware cards and Apple/Google **Wallet passes** bound to your identity;
- **workspaces** for teams, businesses and creators, with custom domains, a developer console and OAuth apps;
- an **AI-agent-ready platform**: agents can prepare a workspace without an account and hand it over to a human through an end-to-end-encrypted vault.

All of this runs on European infrastructure (Neon Postgres in `eu-central-1`, Scaleway Object Storage in `fr-par`, Brevo email). Sign-in uses **phishing-resistant passkeys**: no passwords, no magic links and no social login fallback.

> **Design principle:** the server should learn as little as possible. Keys live in the browser's cryptographic enclave, tokens are stored as hashes, identities are pairwise per app, and the database denies everything by default.

---

## 🗺 Feature map

<table>
<tr><th>Area</th><th>What it does</th><th>Where to look</th></tr>

<tr><td><b>Profiles & handles</b></td>
<td>Public identity pages, handle namespace with reservations and approved brand handles, aliases, migrated-handle redirects, custom badges & heraldry, avatar frames, themes, presets, guestbook, favorites, social grid, link-click analytics (cookieless).</td>
<td><code>src/routes/$username*.tsx</code>, <code>src/routes/u.$username*.tsx</code>, <code>src/lib/approved-handles*</code>, <code>src/lib/avatar-*</code></td></tr>

<tr><td><b>Studio</b></td>
<td>The editor for personal and workspace profiles: drag-and-drop blocks (<code>@dnd-kit</code>), design studio, draft/patch model, contrast pre-flight, grid ingest.</td>
<td><code>src/routes/studio*.tsx</code>, <code>src/routes/_authenticated/studio_.*</code>, <code>src/lib/studio/</code></td></tr>

<tr><td><b>QR Studio</b></td>
<td>Static & dynamic QR codes for URL, vCard, Wi-Fi, SMS, email, WhatsApp, PDF, image, MP3, calendar, maps, SEPA/EPC (IBAN), PayPal, Wero and crypto. Styled patterns, frames, DPI/format export (PNG/SVG/PDF), batch engine, scan-safety checks.</td>
<td><code>src/routes/qr*.tsx</code>, <code>src/routes/qr-code-generator.*</code>, <code>src/components/QR*.tsx</code></td></tr>

<tr><td><b>Links & routing</b></td>
<td>Dynamic short links (<code>/go</code>, <code>/s/$slug</code>, <code>/r/$username</code>), custom domains with DNS checks, root redirects, cookieless analytics and visit de-duplication.</td>
<td><code>src/routes/_authenticated/dashboard.*</code>, <code>db/0128_*</code>, <code>db/0192_*</code></td></tr>

<tr><td><b>ROUT ID (OIDC provider)</b></td>
<td>Full OAuth 2.0 / OIDC provider: discovery, JWKS, PKCE, token, introspection, revocation, userinfo, end-session and back-channel logout. Pairwise subjects by default, granular identity scopes, step-up binding, M2M credentials, sealed signing keys and a private email relay per app.</td>
<td><code>src/lib/oauth/</code>, <code>src/routes/oauth.*</code>, <code>src/routes/[.]well-known.*</code>, <code>src/routes/api_.public.oauth.*</code></td></tr>

<tr><td><b>Developer console</b></td>
<td>Register OAuth apps: credentials, scopes, redirects, branding, publishing, auth logs, schema and AI prompts. API keys, signed webhooks and a credentials API.</td>
<td><code>src/routes/_authenticated/console.*</code>, <code>src/lib/webhooks/</code>, <code>src/lib/api-keys*</code></td></tr>

<tr><td><b>Identity verification</b></td>
<td>Two tiers. <b>Real human</b> proves a unique person and still allows a pseudonym. <b>Legal identity</b> is derived from a government document. Providers: Didit, itsme, eID, W Identity and manual review. A passkey proves device ownership, not uniqueness. Peppered HMACs enforce one person, one identity. Aliases never show the legal name. Linked identities with rel-me, ATProto and fediverse proofs. User-verified claims and selective disclosure through a Merkle ledger.</td>
<td><code>src/lib/identity/</code>, <code>src/lib/ledger/</code>, <code>db/0130_*</code>, <code>db/0146_*</code></td></tr>

<tr><td><b>ROUT Card & Wallet</b></td>
<td>NFC hardware cards with factory pairing, liveness, freeze/unfreeze and CMF metadata. Apple Wallet (<code>.pkpass</code>) and Google Wallet passes, plus server-rendered pass imagery.</td>
<td><code>src/lib/wallet/</code>, <code>src/routes/api_.wallet.*</code>, <code>src/routes/v.$cardId.tsx</code>, <code>src/routes/kaart.$token.tsx</code></td></tr>

<tr><td><b>Workspaces</b></td>
<td>Multi-tenant team spaces: roles, invites, team access, transfers, public pages, social links, icons, studio drafts, encrypted configuration, conversion from personal accounts.</td>
<td><code>src/routes/w.$slug*.tsx</code>, <code>src/routes/_authenticated/studio_.w.*</code>, <code>db/96_workspaces.sql</code>, <code>db/0131_*</code></td></tr>

<tr><td><b>Booking engine</b></td>
<td>Event types with duration, buffers, minimum notice, booking horizon, capacity, confirmation mode, pricing and intake fields. Round-robin and collective host routing, availability bitmaps, signed booking tokens, ICS export and accept/decline actions. Each booking runs in one batch: advisory locks, then an availability check, then the insert. A GiST exclusion constraint is the final guard against double-booking.</td>
<td><code>src/lib/booking-engine/</code>, <code>src/routes/book.$eventTypeId.tsx</code>, <code>src/routes/booking.$bookingId.tsx</code></td></tr>

<tr><td><b>Creator support & payments</b></td>
<td>Tip pages that <b>never move money through ROUT</b>: an EPC/SEPA QR code and IBAN text are always on, and creators can add their own Stripe/Mollie keys, stored only AES-GCM encrypted in <code>psp_credentials</code>. Also donations, gift cards, promo codes, payment pages, Stripe Connect account status, bunq OAuth & banking webhooks, a SEPA review queue, PIX/UPI rails and invoices.</td>
<td><code>src/routes/$username_.tip.tsx</code>, <code>src/routes/gift*.tsx</code>, <code>src/routes/api_.public.stripe-webhook.ts</code></td></tr>

<tr><td><b>SecureShield wallet</b></td>
<td>A prepaid wallet with relay credits (separate from Apple/Google Wallet passes). Stripe top-ups, monthly relay charging and transfer scanning.</td>
<td><code>db/20_secureshield_wallet.sql</code>, <code>src/routes/api_.public.cron.secureshield-billing.ts</code></td></tr>

<tr><td><b>Questions & stories</b></td>
<td>Anonymous Q&A with shadow-mute, trust scoring, anti-deduction and canvas audiences. Feedback engine, event engine, newsletter & subscribers, lead capture, polls, community reviews.</td>
<td><code>src/lib/qa/</code>, <code>src/routes/$username_.ask.tsx</code>, <code>src/routes/feedback.$slug.tsx</code>, <code>src/routes/event.$slug.tsx</code></td></tr>

<tr><td><b>Live presence</b></td>
<td>Ephemeral presence with broadcast boundaries and pulse styles: now-playing (Spotify, Last.fm), Steam, YouTube, ambient weather and status widgets.</td>
<td><code>src/routes/$username_.live.tsx</code>, <code>src/routes/api_.presence.*</code>, <code>db/0185_*</code></td></tr>

<tr><td><b>Integrations</b></td>
<td>Bluesky (ATProto OAuth), Mastodon/fediverse, YouTube vault, Spotify, Snapchat Bitmoji, Steam, Last.fm, Telegram phone verification, SMS gateway, kChat notifications.</td>
<td><code>src/lib/integrations/</code>, <code>src/routes/api_.public.*.callback.ts</code></td></tr>

<tr><td><b>AI agents</b></td>
<td>Account-less agent sandboxes, proof-of-work gated endpoints, encrypted AI-to-human hand-off vaults, an MCP server, <code>/ai-manifest.json</code>, <code>/llms.txt</code> and <code>/.well-known/rout-agent.json</code>.</td>
<td><code>src/lib/agent/</code>, <code>src/lib/vault/</code>, <code>src/lib/pow/</code>, <code>src/lib/mcp-server/</code></td></tr>

<tr><td><b>Data rights</b></td>
<td>Full data export (encrypted vault export), account merge (atomic), account deletion with purge-audit guard, data-deletion page, parental consent & minor safety, transparency reports.</td>
<td><code>src/lib/account-*</code>, <code>src/routes/_authenticated/my-data.tsx</code>, <code>db/0174_*</code></td></tr>

<tr><td><b>Admin portal</b></td>
<td>Members, handles, brands, verifications, recovery approvals, finance, SEPA, gift cards, webhooks, subdomains, integrations, feature switches, infra & ops. Can be split onto a separate admin origin.</td>
<td><code>src/routes/_authenticated/admin.*</code>, <code>src/lib/admin-*</code></td></tr>
</table>

---

## 📊 At a glance

| | |
|---|---|
| Route files (pages, API, `.well-known`, sitemaps) | **~415** |
| Server & domain modules in `src/lib` | **~1,070** |
| UI components in `src/components` | **~520** |
| Test files (unit, rule, Postgres-backed) | **~370** |
| SQL migrations in `db/` | **~200** |
| Tables in the `public` schema | **~195** |
| UI languages | **4** (Dutch, English, French, German) |
| Long-form MDX pages | **~215** |

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Framework | **TanStack Start** `1.168` (SSR + server functions) on **TanStack Router** `1.170`, **React 19** |
| Build | **Vite 8**, Nitro (Cloudflare Workers by default, Vercel preset on demand), MDX via `@mdx-js/rollup` |
| Styling | **Tailwind CSS v4** (`src/styles.css`), Radix UI primitives, `class-variance-authority`, `motion`, `animejs` |
| 3D & motion | `three`, `@react-three/fiber`, `@react-three/drei`, `troika-three-text`, Rive |
| Data fetching | **TanStack Query** `5`, TanStack Table |
| Database | **PostgreSQL on Neon** (HTTP driver `@neondatabase/serverless`), Kysely `0.29` (auth adapter), Drizzle schema mirror |
| Authentication | **Better Auth `1.7`** + `@better-auth/passkey`, `@simplewebauthn` 13 (passkeys only) |
| Cryptography | `jose`, `@noble/hashes`, `@scure/bip39`, `node-forge`, WebCrypto inside a dedicated enclave worker |
| Anti-abuse | ALTCHA proof-of-work captcha, HMAC-signed PoW challenges, rate limits |
| Storage | **Scaleway Object Storage** (S3-compatible, signed via `aws4fetch`) |
| Email | **Infomaniak SMTP** (per-mailbox, TLS 465/587), optional Postmark-compatible fallback, **Brevo** driver + inbound parsing, ImprovMX forwarding, React Email templates |
| Payments | **Stripe** (Checkout, Connect), **bunq** (OAuth, banking webhooks), SEPA/EPC QR |
| Rendering | `@resvg/resvg-wasm` for OG images and wallet artwork, `jspdf`, `jszip`, `qr-code-styling` |
| i18n | `i18next` + `react-i18next` |
| Validation | **Zod 4** (shared between API validation, OpenAPI and AI manifest) |
| Testing | **Vitest 4**, Testing Library, jsdom, **PGlite** (in-process Postgres), `fake-indexeddb` |
| Background worker | Bun, `postgres`, `sharp`, FFmpeg, `playwright-core` + Chromium |

---

## 🏗 Architecture

```text
                                   ┌───────────────────────────────────────────┐
  Browser                          │              ROUT web app                 │
 ┌──────────────────────────┐      │       TanStack Start (SSR + RPC)          │
 │ React 19 UI              │ HTTP │                                           │
 │  ├─ TanStack Router      │◄────►│  src/routes/*            pages & layouts  │
 │  ├─ TanStack Query       │      │  src/routes/api_.*       server routes    │
 │  └─ i18next (nl/en/fr/de)│      │  *.functions.ts          server functions │
 │                          │      │  *.server.ts             server-only logic│
 │ Crypto enclave worker    │      │                                           │
 │  (keys, E2EE, ledger)    │      │  request-context.ts ─► cookies/headers    │
 │ ALTCHA worker (PoW)      │      │  auth/  Better Auth + 2FA policy          │
 └──────────────────────────┘      │  db/    guarded query gateway ─► neon.ts  │
                                   └──────────────┬──────────────┬─────────────┘
                                                  │              │
                         per-request RLS context  │              │ S3 / SMTP / APIs
                         (SET LOCAL rout.*)       ▼              ▼
                                   ┌──────────────────────┐  ┌───────────────────────┐
                                   │ Neon PostgreSQL (EU) │  │ Scaleway · Brevo ·    │
                                   │  role: rout_app      │  │ Stripe · bunq · OIDC  │
                                   │  NOBYPASSRLS, RLS on │  │ providers · Wallets   │
                                   │  every table         │  └───────────────────────┘
                                   └──────────┬───────────┘
                                              │ LISTEN / NOTIFY (new_omni_job)
                                              ▼
                                   ┌──────────────────────┐
                                   │ Omni worker (Bun)    │  media ingest, WebP/WebM,
                                   │  worker/main.ts      │  optional SPA rendering,
                                   │  role: rout_omni_... │  SSE /events
                                   └──────────────────────┘
```

### Request lifecycle

1. **Routing.** TanStack Router file routes in `src/routes` render pages via SSR. `__root.tsx` holds the shared shell. Protected areas live under the `_authenticated` layout.
2. **Server boundary.** App-internal calls use `createServerFn` (`*.functions.ts`). External callers (webhooks, OAuth, cron, wallets, agents) use server routes (`src/routes/api_.*`, `src/routes/api_.public.*`). Each public handler checks its own caller with signatures, tokens or PoW.
3. **Request context.** Any module reachable from a server route reads cookies, headers and the request through `src/lib/request-context.ts` (`createServerOnlyFn` wrappers). It never imports framework server internals directly, which keeps server code out of the browser bundle.
4. **Auth.** `src/lib/auth/middleware.ts` resolves the Better Auth session. Members sign in with a passkey, e-mail link or password; a second step follows when 2FA is on (mandatory for admins). Sensitive actions require **step-up** re-authentication (`step-up*.ts`).
5. **Database.** Handlers run inside `withDbContext(...)` (`src/lib/neon.ts`). Every query batch switches to the `rout_app` role and sets `rout.current_user_id` / `rout.workspace_id` with `set_config(..., true)` (transaction-local). It also asserts that the role is not an owner, a superuser or RLS-bypassing. Postgres **row-level security** decides what is visible.
6. **Browser data client.** `src/lib/db/client.ts` gives the UI a familiar query-builder API. Each descriptor is sent to a guarded server function (`gateway.functions.ts`), checked against a policy (`policy.server.ts`, `query-schema.ts`), and compiled to parameterised SQL (`execute.server.ts`). Identifiers are allow-listed and values are always bind parameters.

### Database transports

`src/lib/neon.ts` exposes one `sql` surface (tagged templates, `sql.query`, `sql.transaction`) over two interchangeable transports, chosen per request:

| Transport | When | Notes |
|---|---|---|
| **Direct** | `DATABASE_URL` is set | Neon serverless HTTP driver. Recommended for self-hosting. |
| **HTTP SQL gateway** | gateway credentials are configured (see `ENVIRONMENT.md`) | Preferred when both are present. The connection string never enters application code. |

Both transports run the **same guarded, atomic batches**: there are no interactive transactions, one HTTP request equals one transaction, and session state never leaks between requests.

---

## 📁 Repository layout

```text
.
├── src/
│   ├── routes/                 # ~415 file routes (pages, API, .well-known, sitemaps)
│   │   ├── __root.tsx          # HTML shell, head, providers
│   │   ├── _authenticated/     # dashboard, studio, console, admin, wallet, settings
│   │   ├── $username*.tsx      # public profile + /tip /ask /live /booking /donate
│   │   ├── api_.*.ts           # authenticated API routes
│   │   ├── api_.public.*.ts    # public API: webhooks, OAuth, cron, callbacks
│   │   └── [.]well-known.*     # OIDC discovery, JWKS, OpenAPI, atproto-did, agent manifest
│   ├── lib/                    # domain + server logic (~1,070 files)
│   │   ├── agent/              # agent sandboxes, AI manifest
│   │   ├── auth/               # sign-in + 2FA policy, step-up, recovery, sessions
│   │   ├── booking-engine/     # availability, event types, tokens
│   │   ├── crypto/ crypto-enclave/ e2ee/   # key handling, enclave worker, E2EE
│   │   ├── db/                 # browser query builder, policy, SQL compiler
│   │   ├── identity/           # verification tiers, linked identities, proofs
│   │   ├── ledger/             # encrypted user ledger, Merkle disclosure
│   │   ├── oauth/              # OIDC provider, tokens, scopes, email relay
│   │   ├── pow/                # signed proof-of-work challenges
│   │   ├── qa/                 # questions & stories, moderation
│   │   ├── security/           # safe errors, guards
│   │   ├── storage/            # S3 (Scaleway) client, shared files
│   │   ├── vault/              # AI→human encrypted hand-off vaults
│   │   ├── wallet/             # Apple/Google passes, card design & liveness
│   │   ├── webhooks/           # signed outbound webhooks
│   │   └── neon.ts             # transport + RLS context
│   ├── components/             # ~520 UI components (Radix-based UI kit in components/ui)
│   ├── content/                # MDX: about, guide, features, product, safety, support, dev…
│   ├── emails/                 # React Email templates, Brevo/Postmark/SMTP drivers
│   ├── locales/                # nl / en / fr / de translation bundles
│   ├── hooks/ layouts/ types/ utils/ assets/
│   ├── test/                   # cross-cutting tests + setup
│   ├── router.tsx  start.ts  server.ts  styles.css
├── db/                         # ordered SQL migrations, baseline, snapshot, seed
├── drizzle/                    # Drizzle schema mirror + journal
├── scripts/                    # migrations, RLS audits, schema snapshot, i18n audits, ops
├── worker/                     # Omni persistent daemon (Bun + FFmpeg + Chromium)
├── public/                     # static assets, fonts (OG rendering), wallet art, press kit
├── ENVIRONMENT.md              # every environment variable, grouped and explained
├── AGENTS.md                   # architecture decisions ("rules + why"); also per-folder AGENTS.md
└── LICENSE                     # GNU AGPL-3.0
```

> 💡 Many folders contain their own `AGENTS.md` (for example `src/lib/oauth/`, `src/lib/wallet/`, `src/lib/identity/`, `src/lib/storage/`, `worker/`). These are short, binding design notes. Read them before changing that area.

### File naming conventions

| Suffix | Runs where | Purpose |
|---|---|---|
| `*.functions.ts` | client calls → server | `createServerFn` RPC endpoints |
| `*.server.ts` | server only | privileged logic, never imported by UI code |
| `*-rules.ts` | anywhere | pure, side-effect-free business rules (heavily unit-tested) |
| `*.test.ts(x)` | Vitest | unit, rule and Postgres-backed tests |
| `*.mdx` / `*.en.mdx` / `*.fr.mdx` / `*.de.mdx` | build time | long-form content per language |

---

## 🔐 Security model

ROUT treats security as architecture, not as a feature. These guarantees are enforced in code and tests:

### Authentication: passkey, e-mail link or password, plus a real second step
- `src/lib/auth/sign-in-policy.ts` allow-lists the Better Auth endpoints. First factors: a **passkey** (WebAuthn, user verification required), a **one-time e-mail link** (15 minutes, with a 6-digit code for another device) or **e-mail + password** (min. 12 characters, set or reset through an e-mailed link that signs out other devices).
- With 2FA on, password and e-mail-link sign-ins stop at a **second step**: authenticator app (TOTP), **SMS** to a verified number, a one-time recovery code or a passkey. E-mail is never a second factor. `src/lib/auth/magic-link-two-factor.ts` extends the second step to e-mail links and exposes `GET /api/auth/two-factor/options`.
- **2FA is optional for members and mandatory for admins**: every admin server call refuses until it is on, the admin portal shows the setup screen first, and the gateway refuses `/two-factor/disable` for admins.
- Password, e-mail-link and reset requests pass a fail-closed rate limit and the ALTCHA bot check first. On the admin portal, sign-in mails only go to admin addresses.
- New accounts are created only with a passkey and a **signed sign-up ticket** (`signup-ticket.ts`); the out-of-band **recovery token** flow (`passkey-enrollment.server.ts`, `db/0207_auth_quarantine.sql`) remains for members who lost their e-mail.
- Social providers (Google, Apple, GitHub, GitLab, Infomaniak, Proton, generic OIDC, Bluesky, Mastodon) only **link** identities. They can never sign you in by themselves.
- Sensitive operations demand **step-up** re-authentication (`step-up-guard.server.ts`, `db/0141_step_up_binding.sql`).

### Database: deny by default
- The runtime role `rout_app` is `NOBYPASSRLS`. Every table has **row-level security** (`db/0120`, `db/0126`, `db/0149_strict_rls_enforcement.sql`).
- The transport refuses to run as an owner, superuser or RLS-bypassing role. Migrations use a separate owner credential and are **never** applied automatically.
- `scripts/audit-rls.ts`, `scripts/enforce-rls.ts` and `scripts/rls-enforcement-preflight.ts` audit coverage. `scripts/schema-snapshot.ts --check` detects drift against `db/schema.snapshot.json`.

### Keys never touch the UI thread
- All browser-side key operations (E2EE device key, Master Key, vault open/reseal, encrypted ledger, hashing) run inside the **cryptographic enclave worker** (`src/lib/crypto-enclave/*`).
- UI code talks to it through a typed `postMessage` client. The worker **wipes** secret and plaintext typed arrays after each operation, and `enclave.test.ts` enforces this.

### Tokens and identities
- Session, recovery, booking, claim and API tokens are stored as **hashes** only (`token-hash.server.ts`, `backup-code-hash.ts`).
- OIDC subjects are **pairwise per client** by default (`db/0142_pairwise_default.sql`), derived with `ROUT_PROVIDER_PAIRWISE_SECRET`. Signing keys are **sealed** under a KEK (`db/0112`, `scripts/seal-signing-keys.ts`).
- Verified humans get a peppered `unique_human_id`, so one person maps to one identity without storing document numbers. Per-app nullifiers use `ROUT_SYBIL_PEPPER`.

### Integrity & accountability
- **Hash-chained audit logs** with a head lock and daily HMAC-signed checkpoints (`db/0127`, `db/0150`, `/api/public/cron/audit-checkpoint`).
- **Signed outbound webhooks** (`db/0129_signed_webhooks.sql`, `src/lib/webhooks/signature.ts`): `X-Rout-Signature: t=<unix>,v1=<HMAC-SHA256(timestamp.body)>`, a 300-second verification window, and up to 8 attempts with exponential backoff capped at 6 hours.
- **CSRF protection** for every server function (`src/start.ts`). Custom API routes verify their own callers.
- **Merkle disclosure ledger** for selective disclosure (`db/0146`).

### AI agents without accounts
- Agents solve an **HMAC-signed proof-of-work** (`/api/v1/pow/challenge`). Each proof is spent exactly once via `rout_pow_spend` (`db/0206`). Failures return `401 challenge_required`.
- A sandbox gets a **48-hour `rsk_` key** and one **unowned** workspace. Login apps stay specs until a human claims them (by link, QR or checksummed code). Only then do they become OAuth clients (`agent-sandbox.ts`, `db/0202`).
- **Ephemeral hand-off vaults** (`src/lib/vault/*`, `db/0205`): the server stores only ciphertext and an argon2id hash of an HKDF claim proof, with a one-hour TTL. The browser decrypts and re-seals with the member's device key, then atomically commits to `workspaces.encrypted_config` and deletes the vault. **The raw secret never returns to the server.**
- `/ai-manifest.json` is generated from the **same Zod schemas and contrast rules** the API enforces, so the documentation can never drift from validation.

### Privacy defaults
- Cookieless analytics, visit de-duplication without storing referrers (`db/0194_drop_visit_referrer.sql`), dropped birthdates (`db/0161`), scheduled purges of expired data, a sunset scrubber and parental-consent flows for minors.
- Cookies are `Secure`, `HttpOnly`, `SameSite=Lax` and host-only.

> Found a vulnerability? Please disclose it responsibly through the contact details on `/security`. Do not open a public issue.

---

## 🚀 Getting started

### Prerequisites

- **Bun ≥ 1.4** (the lockfile is `bun.lock`). Node 22+ works for tooling.
- A **PostgreSQL database on Neon** (EU region recommended), with:
  - an **owner** credential for migrations only, and
  - a **runtime login** that is granted the `rout_app` role (not an owner, not `BYPASSRLS`).
- Optional: FFmpeg + Chromium if you run the Omni worker locally.

### Install & run

```sh
git clone https://github.com/Routbe/rout-compass-explorer.git
cd rout-compass-explorer

bun install

# Copy the variables you need from ENVIRONMENT.md into .env.local (never commit it)
#   minimum: DATABASE_URL, PUBLIC_ORIGIN, BETTER_AUTH_SECRET, BETTER_AUTH_URL

bun run dev            # http://localhost:8080 (default port)
```

Without a database the public marketing pages, QR Studio and documentation still render. Account features show a clear "not configured" state, and the server logs `[auth] no runtime database configured.`

### Available scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the dev server with SSR and hot reload |
| `bun run build` | Production build (Nitro, Cloudflare Workers target by default) |
| `bun run build:dev` | Development-mode build |
| `bun run preview` | Serve the production build locally |
| `bun run test` | Run the full Vitest suite once |
| `bun run test:watch` | Vitest in watch mode |
| `bun run lint` | ESLint (TypeScript, React Hooks, jsx-a11y, Prettier) |
| `bun run format` | Prettier write |
| `bunx tsgo --noEmit` | Fast type check |

### Operational scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `bun scripts/migrate.ts [--dry-run] [--baseline=N]` | Apply pending `db/*.sql` with the **owner** connection (`MIGRATION_URL`). Refuses to run when it equals `DATABASE_URL`. |
| `bun scripts/migrate-gateway.ts [--dry-run] [--only=a.sql,b.sql]` | Apply pending migrations through the HTTP SQL gateway, tracked in `public.schema_migrations`. |
| `bun scripts/migration-plan.ts` | Plan and checksum migrations, detect drift. |
| `bun scripts/schema-snapshot.ts [--check \| --types \| --baseline]` | Write or check `db/schema.snapshot.json` and regenerate `src/lib/db-types.gen.ts`. |
| `bun scripts/schema-replay-snapshot.ts` | Replay migrations into a scratch database and snapshot the result. |
| `bun scripts/audit-rls.ts` · `enforce-rls.ts` · `rls-enforcement-preflight.ts` | Audit and enforce row-level security coverage. |
| `bun scripts/check-release-env.ts` | Validate release configuration. Prints only missing names, never values. |
| `bun scripts/seal-signing-keys.ts` | Seal OIDC signing keys under the KEK. |
| `bun scripts/revoke-all-sessions.ts` | Emergency: revoke every session. |
| `bun scripts/seed-test-user.ts` | Seed a local test member. |
| `bun scripts/i18n-audit.ts` · `i18n-hardcoded.ts` | Find missing translations and hard-coded strings. |
| `bun scripts/audit-brevo-templates.ts` · `sync-brevo-templates.ts` | Keep Brevo templates in sync with `src/emails`. |
| `bun scripts/telegram-set-webhook.ts <origin>` | Register the Telegram verification bot webhook. |

---

## ⚙️ Configuration

**[`ENVIRONMENT.md`](ENVIRONMENT.md) is the single source of truth.** It documents every variable, its purpose and its rotation rules. Summary:

| Group | Key variables | Required? |
|---|---|---|
| Core | `DATABASE_URL`, `PUBLIC_ORIGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_SITE_URL` | ✅ |
| Secrets (32+ chars) | `APP_SESSION_SECRET`, `SESSION_SECRET`, `OAUTH_STATE_SECRET`, `BOOKING_TOKEN_SECRET`, `BOOKING_HMAC_KEY`, `GO_LINK_SECRET`, `ALTCHA_HMAC_KEY`, `CONTACT_HASH_SALT`, `ADMIN_BOOTSTRAP_TOKEN`, `CRON_SECRET` | ✅ for production |
| ROUT ID provider | `ROUT_PROVIDER_PAIRWISE_SECRET`, `ROUT_PROVIDER_SIGNING_KEK`, `OAUTH_CLIENT_SECRET_PEPPER` | ✅ when the OIDC provider is used |
| Identity linking | `GOOGLE_*`, `APPLE_*`, `GITHUB_*`, `GITLAB_*`, `INFOMANIAK_*`, `PROTON_*`, `OIDC_*` | optional |
| Verification (KYC) | `IDENTITY_HASH_PEPPER`, `W_IDENTITY_*`, `DIDIT_*` | optional |
| Storage | `SCALEWAY_ACCESS_KEY`, `SCALEWAY_SECRET_KEY`, `SCALEWAY_ENDPOINT`, `SCALEWAY_REGION`, `SCALEWAY_*_BUCKET` (or generic `S3_*`) | optional |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER_AUTH` / `SMTP_PASS_AUTH`, `SMTP_USER_SYSTEM` / `SMTP_PASS_SYSTEM`, `BREVO_*`, `EMAIL_FROM`, `IMPROVMX_API_KEY`, `EMAIL_INBOUND_TOKEN`, `ROUT_FORWARD_EMAIL_DOMAIN` | ✅ for sign-up mail |
| Payments | `STRIPE_*`, `BUNQ_*`, `BANKING_WEBHOOK_*`, `PIX_*`, `UPI_VPA`, `PROMO_CODES` | optional |
| Wallet passes | `APPLE_WALLET_*`, `GOOGLE_WALLET_*` | optional (falls back to a demo payload with `503`) |
| Phone & SMS | `SMS_*`, `PHONE_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN` | optional |
| Integrations | `SPOTIFY_*`, `SNAPCHAT_*`, `STEAM_WEB_API_KEY`, `LASTFM_API_KEY`, `GITHUB_TOKEN` | optional |
| Audit & privacy | `ROUT_AUDIT_SIGNING_SECRET`, `ROUT_SYBIL_PEPPER`, `PSP_ENCRYPTION_KEY` | ✅ for production |
| Deployment mode | `VITE_APP_MODE` / `APP_MODE` = `public` \| `admin` | optional |
| Omni worker | `OMNI_REALTIME_SECRET`, `OMNI_EVENTS_URL`, `OMNI_DATABASE_URL` (worker only) | optional |

> ⚠️ **Never rotate** `ROUT_PROVIDER_PAIRWISE_SECRET`, `IDENTITY_HASH_PEPPER` or `ROUT_SYBIL_PEPPER` after launch. Rotating them changes every pairwise identity and uniqueness identifier. Never prefix a secret with `VITE_`, because `VITE_*` values are shipped to the browser.

### Deployment modes

| `VITE_APP_MODE` | Serves | Typical origin |
|---|---|---|
| `public` | Everything except `/admin`, `/api/admin` and admin server functions (404/403) | `rout.be` |
| `admin` | Only the admin portal + sign-in, no social linking, `noindex` | separate admin origin |
| *(unset)* | Everything (development / preview) | localhost |

---

## 🗄 Database

### Migrations

- `db/` contains **ordered, immutable** SQL migrations, from `00_compat.sql` and `01_align.sql` up to `0207_auth_quarantine.sql`, plus `0000_baseline.sql`, `baseline-seed.sql` and `schema.snapshot.json`.
- Historical migrations are **never edited**. Fixes ship as new delta migrations (for example `0143_schema_grants_alignment.sql`).
- Applied files are tracked with SHA-256 checksums in `public.schema_migrations`.
- `0000_baseline.sql` covers every migration up to **110**. On an empty database the planner runs the baseline and marks the covered files as applied. On an existing database it records the baseline and runs only the outstanding deltas (`scripts/migration-plan.ts`).
- `db/baseline-seed.sql` seeds reference rows only: pricing configuration, a promo code, a badge and the first-party PKCE client `rout_native_self`. It contains no member accounts.
- Better Auth stores its own tables in the `neon_auth` schema.
- Migrations are **reviewed and applied by a human** with an owner credential: `bun scripts/migrate.ts`, `bun scripts/migrate-gateway.ts`, or the Neon SQL editor. Builds and deploys never run them.

### Roles

| Role | Used by | Rights |
|---|---|---|
| owner (e.g. `neondb_owner`) | migrations only | DDL |
| `rout_app` | web runtime (via a dedicated login) | DML through RLS, `NOBYPASSRLS` |
| `rout_omni_worker` | Omni worker | job queue + ingest tables only |

Create the runtime login once in the Neon SQL editor, choosing the password there:

```sql
CREATE ROLE rout_runtime WITH LOGIN PASSWORD '<choose a strong password>';
GRANT rout_app TO rout_runtime;
```

Then use that login's connection string as `DATABASE_URL`.

### Schema tooling

- The SQL files in `db/` are canonical. `drizzle/` only holds generated metadata and is not the migration history. `src/lib/db-types.gen.ts` is generated from the snapshot.
- `bun scripts/schema-snapshot.ts --check` exits non-zero when the live catalog drifts from `db/schema.snapshot.json`. Run it after every migration.

### Domain overview (selection)

```text
identity      users · sessions · passkeys · identity_links · verified_identities · oidc_subjects
profiles      profiles · handles · aliases · badges · social_links · profile_visits · link_clicks
workspaces    workspaces · members · team access · domains · studio drafts · encrypted_config
oauth         oauth clients · codes · refresh tokens · signing keys (sealed) · consents · relays
commerce      donations · tip pages · gift cards · promo codes · stripe connect · sepa queue
engagement    questions · stories · guestbook · polls · reviews · feedback · events · subscribers
booking       event types · availability · booking requests · booking tokens · calendars
cards         hardware cards · freezes · factory pairing · wallet passes
agents        agent sandboxes · ephemeral vaults · pow_spent_challenges
platform      audit_logs (hash-chained) · webhooks · rate_limits · schema_migrations · omni jobs
```

---

## ⚡ The Omni worker

`worker/` is a **persistent Bun daemon** that runs separately from the web runtime, on a European Linux VPS or container host.

- Listens on Postgres `LISTEN/NOTIFY` (`new_omni_job`, `omni_job_changed`) and claims jobs atomically with `SKIP LOCKED` and leases.
- Fetches media with DNS-pinned HTTPS and converts it: images to **WebP** with `sharp`, short muted **WebM** previews with FFmpeg (hard 60 s kill).
- Optional, sandboxed **SPA rendering** with Chromium for an exact host allow-list (`OMNI_RENDER_HOSTS`).
- Streams progress to the Studio over **SSE** (`/events`) with short-lived tickets.
- Fails closed on unsafe database roles. It needs an **unpooled** TCP connection (`OMNI_DATABASE_URL`) because `LISTEN` does not work through poolers or HTTP.

```sh
bun install --cwd worker
bun run worker/main.ts                         # or:
docker build -f worker/Dockerfile .            # Bun 1.4 + FFmpeg + Chromium image, port 8090
```

Full provisioning steps: [`worker/README.md`](worker/README.md).

---

## 🌐 Public & machine-readable endpoints

| Path | Description |
|---|---|
| `/.well-known/openid-configuration` | OIDC discovery for ROUT ID |
| `/.well-known/jwks.json` | Public signing keys |
| `/.well-known/openapi.json` | OpenAPI document |
| `/.well-known/atproto-did` | Bluesky handle verification |
| `/.well-known/rout-agent.json` | Agent discovery document |
| `/ai-manifest.json` | OpenAPI + design-token AST generated from the live Zod schemas |
| `/llms.txt`, `/llms-full.txt` | LLM-friendly site summaries |
| `/api/mcp` | Model Context Protocol server |
| `/api/v1/pow/challenge` | Signed proof-of-work challenge |
| `/api/v1/agent/vault`, `/api/agent/sandbox*` | Agent hand-off vaults & sandboxes |
| `/api/public/oauth/{token,userinfo,introspect,revoke}` | OAuth 2.0 endpoints |
| `/oauth/authorize`, `/oauth/end-session` | Authorization & RP-initiated logout |
| `/api/public/health` | Health check |
| `/api/public/og/$handle` | Dynamic Open Graph images |
| `/sitemap.xml` (+ `-static`, `-profiles`, `-workspaces`, `-calendars`) | Sitemaps |
| `/api/public/stripe-webhook`, `/api/public/webhooks/banking`, `/api/public/identity/didit-webhook`, `/api/public/telegram/webhook`, `/api/public/email-forward`, `/api/public/sms/inbound` | Signed or token-protected inbound webhooks |

---

## ⏱ Scheduled jobs

Each job is a server route under `/api/public/cron/*`, authenticated with a bearer `CRON_SECRET`:

| Job | Purpose |
|---|---|
| `cleanup-assets` | Remove expired user assets & shared files, expired ALTCHA rows and security codes, run DNS checks (daily) |
| `audit-checkpoint` | Sign the audit hash-chain head |
| `deliver-webhooks` | Deliver queued signed webhooks with retries |
| `availability` | Recompute booking availability |
| `check-dns` | Verify custom domains |
| `purge-accounts` · `purge-agent-workspaces` · `purge-altcha` · `purge-shared-files` | Enforce retention |
| `scan-transfers` · `secureshield-billing` | Payments & SecureShield |
| `sunset-scrubber` | Scrub data past its sunset |
| `sync-followers` · `sync-socials` | Refresh integration reach |

> Plans with only one cron slot should schedule `cleanup-assets` daily, then give each other job its own reviewed schedule.

---

## 🌍 Internationalisation

- UI strings live in `src/locales/{nl,en,fr,de}.json`, loaded through `i18next` (`src/lib/i18n.tsx`, fallback `en → nl`).
- Long-form pages use per-language MDX files: `page.mdx` (Dutch) plus `page.en.mdx`, `page.fr.mdx` and `page.de.mdx`.
- Email templates are localised in `src/emails`.
- `bun scripts/i18n-audit.ts` reports missing keys. `bun scripts/i18n-hardcoded.ts` finds untranslated literals.

---

## 📚 Content & documentation pages

`src/content/` holds ~215 MDX documents, collected at build time by a virtual `virtual:rout-docs` module (see `vite.config.ts`):

| Section | Routes |
|---|---|
| About | `/about/*`: manifesto, sovereignty, platform, ecosystem, ROUT Card, responsible AI, open source, brand |
| Product & features | `/product/*`, `/features/*`: batch engine, dynamic links, custom domains, profile hub, design studio, cookieless analytics |
| Guides | `/guide/*`, `/qr-code-generator/*`: QR design, frames, printing, dynamic QR |
| Developers | `/dev/*`: get started, identity & OIDC, credentials API, webhooks, AI & MCP, design system, emails |
| Safety | `/safety/*`: architecture, cryptography, zero-knowledge, privacy, compliance, transparency, advisories |
| Support & info | `/support/*`, `/info/*`: account, workspaces, billing, every product feature |
| Compare | `/compare/*`: Linktree, Bitly and Auth0 alternatives |

---

## 🧪 Testing & quality

```sh
bun run test -- --maxWorkers=2   # full suite
bunx vitest run src/lib/oauth    # one area
bunx tsgo --noEmit               # type check
bun run lint
```

- **~370 test files** cover pure rules (`*-rules.test.ts`), server modules, React components and routing.
- **Postgres-backed tests** (`*-postgres.test.ts`) run real SQL, including RLS and atomic merges, against **PGlite**, an in-process Postgres. No external database is needed.
- The browser test environment uses jsdom and `fake-indexeddb`, set up in `src/test/setup.ts`.
- `enclave.test.ts` guarantees that the enclave worker zeroes its secrets. The `sign-in-policy`, `magic-link-two-factor`, `admin-two-factor`, `step-up`, `token-policy`, `redirect-match` and `scope-rules` suites guard the security core.

---

## 📦 Deployment

The app builds with **Nitro**:

| Target | How |
|---|---|
| **Cloudflare Workers** (default) | `bun run build`. The output targets an edge (workerd) runtime. |
| **Vercel** | Set `VERCEL=1` during the build, which selects Nitro's `vercel` preset (`vite.config.ts`). |
| **Omni worker** | Separate Docker image on a persistent host (`worker/Dockerfile`). |

### Release checklist

1. `bun run test -- --maxWorkers=2` and `bunx tsgo --noEmit` pass.
2. `bun scripts/check-release-env.ts` reports no missing settings.
3. Pending migrations are reviewed and applied by hand. Then `bun scripts/schema-snapshot.ts --check` is clean.
4. `DATABASE_URL` uses a login that holds `rout_app`, **not** the owner role.
5. Every OAuth provider's callback points to `<PUBLIC_ORIGIN>/api/auth/callback/<provider>`.
6. Webhooks (Stripe, banking, Didit, Telegram, Brevo inbound) are registered with their secrets.
7. Cron schedules are configured with `CRON_SECRET`.
8. Run real sign-up and sign-in with a passkey, plus storage, mail, payment and wallet checks, end to end on the production domain.

---

## 🛠 Operations runbook

| Situation | Action |
|---|---|
| Suspected session compromise | `bun scripts/revoke-all-sessions.ts` |
| Member lost every passkey | Admin portal → **Recovery** issues an approved recovery token |
| Schema drift detected | `bun scripts/schema-snapshot.ts --check`, then ship a new delta migration (never edit history) |
| RLS gap reported | `bun scripts/audit-rls.ts`, then `scripts/enforce-rls.ts` after review |
| Signing-key rotation | Add new key → `bun scripts/seal-signing-keys.ts` → publish via JWKS → retire old key |
| Webhook backlog | Check `/api/public/cron/deliver-webhooks` schedule and `webhook_deliveries` |
| Wallet passes failing | Verify `APPLE_WALLET_*` / `GOOGLE_WALLET_*`. Partial config returns `503` with a demo payload. |

### Known gaps

These items are referenced in the code or docs but not yet present in the repository:

- [ ] `vercel.json` and the `build:vercel`, `db:check` and `release:check` package scripts, which `ENVIRONMENT.md` mentions. Use the direct `bun scripts/...` commands above until they are added.
- [ ] `public/sw.js`: `src/lib/pwa.ts` registers a service worker, but the file is not checked in, so there is no offline support yet.
- [ ] `worker/bun.lock`: `worker/Dockerfile` copies it with `--frozen-lockfile`. Run `bun install --cwd worker` once and commit the lockfile before building the image.

---

## 🤝 Contributing

1. **Read the design notes first:** root `AGENTS.md` plus the `AGENTS.md` in the folder you touch. They record each decision and why it was made.
2. Keep business rules **pure** in `*-rules.ts` and cover each rule with a focused test.
3. Server-only code goes in `*.server.ts`. Never import it from UI modules. Use `request-context.ts` for cookies and headers.
4. Never weaken RLS, the sign-in and 2FA policy, the enclave boundary or the PoW gate without a written design note.
5. Database changes are **new** migration files only, followed by an updated snapshot.
6. Add translations for all four languages, and run `bun scripts/i18n-audit.ts`.
7. Run `bun run lint`, `bunx tsgo --noEmit` and `bun run test` before opening a pull request.

Commit style: short, imperative subject lines (`oauth: enforce pairwise default for new clients`).

---

## 📄 License

ROUT is free software, licensed under the **GNU Affero General Public License v3.0**. See [`LICENSE`](LICENSE).

If you run a modified version as a network service, the AGPL requires you to offer its source code to its users.

<div align="center">
<sub>Built in Europe · Privacy by design · <a href="https://rout.be">rout.be</a></sub>
</div>
