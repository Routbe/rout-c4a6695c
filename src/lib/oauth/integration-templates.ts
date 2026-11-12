/** Pure generators for AI prompts and database schema templates (Developer Console). */
import { BRAND, LOGO_INNER, LOGO_VIEWBOX } from "@/lib/brand/logo";
import { routButtonSnippet } from "./button-kit";

export const ROUT_ISSUER = "https://rout.be";
export const DISCOVERY_URL = `${ROUT_ISSUER}/.well-known/openid-configuration`;

/**
 * The official ROUT bunny as ready-to-paste inline SVG for AI coders.
 * Source of truth is `src/lib/brand/logo.ts` — never draw another rabbit.
 */
export const ROUT_BUNNY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}" fill="currentColor" role="img" aria-label="ROUT" width="20" height="25"><g fill="${BRAND.ink}">${LOGO_INNER}</g></svg>`;

/** Branding & UI section shared by every generated AI prompt. */
function brandingSection(): string[] {
  return [
    "",
    "## Branding & UI (strict)",
    `- The "Login with ROUT" button MUST show the official ROUT bunny logo. Use this exact inline SVG, unmodified (you may only change width/height proportionally and the fill color):`,
    "",
    "```html",
    ROUT_BUNNY_SVG,
    "```",
    "",
    `- Brand colors: ROUT purple ${BRAND.purple}, mint ${BRAND.mint}, ink ${BRAND.ink}, paper ${BRAND.paper}.`,
    "- Use the canonical button markup below; adapt labels to the app language, preserve the official logo and accessible focus state. Connect ROUT links an already authenticated local account; it must not create or replace the local session.",
    routButtonSnippet("login"),
    routButtonSnippet("connect"),
    "- Never redraw, stretch, rotate or recolor the bunny beyond the allowed fill change; never replace it with another icon or animal.",
  ];
}

export type AppType = "web" | "spa" | "native";
export type AiTool = "cursor" | "copilot" | "lovable" | "generic";
export type Stack = "nextjs" | "tanstack" | "express" | "other";

export type TemplateApp = {
  clientId: string;
  scopes: string[];
  redirectUris: string[];
  requirePkce: boolean;
  richIdentityEnabled: boolean;
  accountDiscoveryEnabled: boolean;
  /** Universal Handle Sync: `rout_handle` claim, refreshed on every login. */
  handleSyncEnabled?: boolean;
};

const STACKS: Record<Stack, string> = {
  nextjs: "Next.js (App Router, route handlers)",
  tanstack: "TanStack Start (createServerFn + server routes)",
  express: "Node.js / Express",
  other: "my current stack",
};

const TOOLS: Record<AiTool, string> = {
  cursor: "You are working inside Cursor on my codebase.",
  copilot: "You are GitHub Copilot Chat working in my repository.",
  lovable: "You are Lovable, building my app.",
  generic: "You are an expert full-stack engineer.",
};

/** Claims returned per scope (mirrors identityClaims in provider.server.ts). */
export const SCOPE_CLAIMS: Record<string, string[]> = {
  openid: ["sub"],
  profile: ["preferred_username", "name", "picture"],
  email: ["email", "email_verified"],
  "profile:read": ["preferred_username", "name", "picture"],
  "sybil:verify": ["is_unique_human", "app_sybil_nullifier"],
  "identity:legal_name": ["first_name", "last_name", "full_legal_name"],
  "accounts:merge": ["rout_matched_account"],
  "identity:handle_reservation": ["rout_handle_reservation"],
};

/** Every claim ROUT can ever send (advertised as `claims_supported` in discovery). */
export const CLAIMS_SUPPORTED = [
  "sub", "iss", "aud", "exp", "iat", "nonce", "acr",
  "preferred_username", "name", "picture", "email", "email_verified",
  "rout_handle", "rout_handle_reservation", "rout_public_activity", "rout_matched_account",
  "is_unique_human", "app_sybil_nullifier", "first_name", "last_name", "full_legal_name",
] as const;

export function claimsForScopes(scopes: string[], handleSync = false): string[] {
  const out = new Set<string>(["sub"]);
  for (const s of scopes) for (const c of SCOPE_CLAIMS[s] ?? []) out.add(c);
  if (handleSync && scopes.includes("profile")) out.add("rout_handle");
  return [...out];
}

/** Scope-specific instructions shared by the full prompt and the change prompts. */
export function featureInstructions(app: TemplateApp): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (app.scopes.includes("email")) {
    out["email"] = [
      "- `email` + `email_verified` come from the id_token/userinfo. The member may pick a private relay address for your app; treat it as a normal address and never ask for the 'real' one.",
      "- Email sync (optional): if a webhook URL is registered in the ROUT console (Credentials), ROUT POSTs JSON `{ event: \"https://schemas.rout.be/events/user-email-updated\", sub, previous_email, new_email, updated_at }` with headers `x-rout-event: user.email_updated` and `x-rout-signature: t=<unix>,v1=<hex>`; v1 = HMAC-SHA256(ROUT_WEBHOOK_SECRET, `${t}.${rawBody}`). Verify in constant time, reject if |now - t| > 300 s, then update the email of the user whose rout_id = sub. `sub` is your app-specific id; no other user id is ever sent.",
    ];
  }
  if (app.scopes.includes("identity:handle_reservation")) {
    out["identity:handle_reservation"] = [
      "- Handle reservation (`identity:handle_reservation`): the id_token and userinfo contain `rout_handle_reservation` = { status, handle?, verified_human, issued_at, binding? }. Only when status is \"reserved\" may you set the user's UNIQUE `username` to `handle` (lower-case) without your own anti-bot or anti-squatting checks; ROUT vouches it is the member's own root handle on an active, e-mail-confirmed account.",
      "- Status \"unavailable\" or \"rate_limited\": do not adopt a name; fall back to your normal username flow and try again at the next login. Never accept the handle from client input.",
      "- Integrity: store `binding` next to the username. It equals base64url(SHA-256(`rout-hr-v1|" + app.clientId + "|${sub}|${handle}`)); recompute it when you load the record and treat a mismatch as tampered data. Always link users by `sub`, never by the handle.",
    ];
  }
  if (app.scopes.includes("accounts:merge")) {
    out["accounts:merge"] = [
      "- Blind Hash Matching (`accounts:merge`): before redirecting, build up to 20 hashes of identifiers you already hold for the person (e.g. from a 'forgot account' form or a remembered device): `sha256hex(\"rout-bhm-v1|" + app.clientId + "|\" + kind + \":\" + value)` where kind is email | google | github | gitlab | apple | microsoft | discord, emails trimmed + lower-cased, provider ids trimmed only.",
      "- Append them to the authorize URL as a FRAGMENT: `#rout_blind_hashes=<hex>,<hex>` (never as a query parameter). ROUT never stores them; the member's browser compares them locally.",
      "- If the member confirms a match, the id_token (only the id_token, not userinfo) contains `rout_matched_account: { kind, value }`. Link the ROUT `sub` to your existing user that owns exactly that identifier, inside a transaction, refusing if that user is already linked to another ROUT account. Absent claim = no match or member declined: continue as a new account.",
    ];
  }
  if (app.scopes.includes("sybil:verify")) {
    out["sybil:verify"] = ["- `sybil:verify` (userinfo): `is_unique_human` boolean and `app_sybil_nullifier` (stable per person for YOUR app only). Use the nullifier as a UNIQUE column to allow one account per real person. The member can decline this scope; handle `false`/absent."];
  }
  if (app.scopes.includes("sybil:verify") || app.scopes.includes("identity:legal_name")) {
    out["verify-step"] = [
      "- Graduated consent: keep the first sign-in minimal (`openid profile email`). Ask for `sybil:verify` / `identity:legal_name` only when the user clicks the \"Verifiëren met ROUT\" button (markup below) on an already signed-in account.",
      "- That button starts a NEW authorization request (fresh state, nonce and PKCE) whose `scope` is the full set you need now (base scopes + the extra ones). ROUT shows the member only the new items and keeps the earlier permission. Do not send `prompt=consent` unless you deliberately want the full list again.",
      "- After the callback, verify that the returned `sub` equals the signed-in user's stored `sub` before saving any verification result; otherwise reject it.",
      routButtonSnippet("verify"),
    ];
  }
  if (app.scopes.includes("identity:legal_name")) {
    out["identity:legal_name"] = ["- `identity:legal_name` (userinfo): `first_name`, `last_name`, `full_legal_name` of a verified member; null when not verified or declined. Display them read-only; never let users edit a verified legal name."];
  }
  if (app.richIdentityEnabled) {
    out["rich"] = ["- Rich Identity is enabled: when the member ticked the extra checkbox, the id_token contains `rout_public_activity` (array of { kind, title, occurred_at }). Store it in a jsonb column `rout_public_activity`, overwrite it on every login, and clear it when the claim is absent (the member withdrew consent). Never accept it from client input."];
  }
  if (app.handleSyncEnabled) {
    out["handle"] = [
      "- Universal Handle Sync is enabled: the `rout_handle` claim (requires the `profile` scope) is the user's username. Add a UNIQUE `username` column, set it from `rout_handle` on every login, and do NOT build a separate username picker or let users edit it.",
      "- Refresh `username` from `rout_handle` on every login and always look users up by `sub`, never by the handle.",
    ];
  }
  if (app.accountDiscoveryEnabled) {
    out["discovery"] = [
      "- Account Discovery is enabled: after a user-initiated authorization and verified callback, offer linking when email_verified is true and the email matches an existing local account. Require an authenticated local session, explicit consent and conflict checks; never merge solely because emails match.",
      "- Authorization always requires an explicit button click or form submission. Do not implement silent sign-in or automatic redirects for account discovery.",
    ];
  }
  return out;
}

export function buildAiPrompt(app: TemplateApp, tool: AiTool, stack: Stack): string {
  const scopes = app.scopes.join(" ");
  const redirect = app.redirectUris.length ? app.redirectUris.join(" , ") : undefined;
  const lines = [
    TOOLS[tool],
    `Implement "Login with ROUT" (OpenID Connect) in ${STACKS[stack]}.`,
    "",
    "## Configuration",
    `- Discovery URL: ${DISCOVERY_URL}`,
    `- client_id: ${app.clientId}`,
    "- Confidential server client: read client_secret from ROUT_CLIENT_SECRET on the server. Public SPA/native client: use PKCE without a secret; never invent or embed one.",
    `- Scopes: ${scopes}`,
    `- Redirect URI(s), byte-for-byte exact: ${redirect ?? "NOT CONFIGURED — request the exact registered URI before enabling authorization."}`,
    `- PKCE: ${app.requirePkce ? "REQUIRED (S256)" : "recommended (S256)"}`,
    `- Claims you will receive (userinfo / id_token): ${claimsForScopes(app.scopes, app.handleSyncEnabled).join(", ")}`,
    "",
    "## Flow requirements",
    "0. Inspect existing auth and preserve all working sign-in methods. Do not activate ROUT, Google or any other provider until its start handler, callback and real configuration exist and pass an end-to-end check. Missing configuration must yield a disabled button and a clear setup error, not a fabricated value.",
    "0a. Start authorization ONLY after the user clicks or submits the button. Never auto-redirect on mount, page load, route guard or an effect; never silently log in by default. Account discovery is data linking after a verified callback, NOT authorization to initiate login.",
    "0b. Use a proven OIDC library for state, nonce, PKCE and token validation. Keep login and account linking separate; link only with an existing local session, explicit consent and conflict checks. Do not link an identity already belonging to another local account.",
    "1. Fetch endpoints from the Discovery URL (do not hardcode them).",
    "2. Authorization Code flow with PKCE S256: generate code_verifier, state and nonce per attempt; store them in an HttpOnly, Secure, SameSite=Lax cookie.",
    "3. On the callback, verify `state`, then exchange the code at the token endpoint ON THE SERVER with the code_verifier.",
    "4. Validate the id_token: signature via JWKS (ES256), iss, aud === client_id, exp, and nonce.",
    "5. Create a session for the user; never expose tokens to client-side JavaScript.",
    "6. Map ROUT errors (?error=...) to friendly UI messages.",
    "",
    "## Database changes",
    "- Add a unique `rout_id` (text, the `sub` claim) to the users table.",
    "- Add `email_verified` boolean from the email_verified claim.",
  ];
  for (const block of Object.values(featureInstructions(app))) lines.push(...block);
  lines.push(...brandingSection());
  lines.push(
    "",
    "## Deliverables",
    "- A 'Login with ROUT' button, callback handler, logout, and the migration.",
    "- No analytics or tracking scripts on the auth pages.",
  );
  return lines.join("\n");
}

export function buildSqlSchema(app: TemplateApp): string {
  const rich =
    (app.handleSyncEnabled ? `,
  username       text unique,           -- ROUT 'rout_handle' claim (Universal Handle Sync)` : "") +
    (app.richIdentityEnabled ? `,
  rout_public_activity jsonb,           -- Rich Identity, only with member consent` : "");
  let out = `-- Users: one row per person in your app
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  email_verified boolean not null default false,
  rout_id        text unique,           -- ROUT 'sub' claim${rich},
  created_at     timestamptz not null default now()
);`;
  if (app.accountDiscoveryEnabled) {
    out += `

-- Account Auto-Discovery: link ROUT to existing accounts instead of duplicating
create table user_identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  provider    text not null,             -- 'rout', 'password', ...
  provider_id text not null,             -- ROUT 'sub'
  linked_at   timestamptz not null default now(),
  unique (provider, provider_id),        -- one ROUT account → one user
  unique (user_id, provider)             -- one ROUT link per user
);
-- Merge rule: only link when the id_token says email_verified = true.`;
  }
  return out;
}

export function buildPrismaSchema(app: TemplateApp): string {
  const rich =
    (app.handleSyncEnabled ? `
  username      String?  @unique // ROUT 'rout_handle' claim` : "") +
    (app.richIdentityEnabled ? `
  routPublicActivity Json? @map("rout_public_activity")` : "");
  let out = `model User {
  id            String   @id @default(uuid())
  email         String?  @unique
  emailVerified Boolean  @default(false) @map("email_verified")
  routId        String?  @unique @map("rout_id")${rich}
  createdAt     DateTime @default(now()) @map("created_at")${app.accountDiscoveryEnabled ? "\n  identities    UserIdentity[]" : ""}
}`;
  if (app.accountDiscoveryEnabled) {
    out += `

model UserIdentity {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider   String
  providerId String   @map("provider_id")
  linkedAt   DateTime @default(now()) @map("linked_at")

  @@unique([provider, providerId])
  @@unique([userId, provider])
}`;
  }
  return out;
}

/* ------------------------------------------- Universal Handle Sync + badges */

export type PromptApp = { name: string; clientId: string };

/** Opening lines shared by every prompt so the chosen assistant + stack apply everywhere. */
function promptIntro(tool: AiTool, stack: Stack): string[] {
  return [TOOLS[tool], `Build this in ${STACKS[stack]}.`, "Preserve existing authentication. Never activate a provider without real configuration, a start handler and a validated callback. Never start login automatically; require an explicit user action. Do not invent credentials, registered redirect URIs or available APIs.", ""];
}

export function buildHandleSyncPrompt(app: PromptApp, tool: AiTool = "generic", stack: Stack = "other"): string {
  return [
    ...promptIntro(tool, stack),
    `I am building an app ("${app.name}") and want to integrate 'Login with ROUT' as my authentication and identity provider.`,
    `Please build the standard OIDC OAuth2 flow using the discovery URL: \`${DISCOVERY_URL}\`.`,
    `My Client ID is: ${app.clientId}.`,
    "CRITICAL REQUIREMENT: Do not build a custom username system. Instead, extract the `rout_handle` claim from ROUT's UserInfo endpoint and map it directly as the primary unique `username` field in our database. Refresh it from `rout_handle` on every login and always look users up by `sub`.",
    "",
    "## Configuration",
    "- Request the exact registered redirect URI before enabling the button. Confidential clients use ROUT_CLIENT_SECRET server-side; public clients use PKCE without a secret.",
    "- Scopes: `openid profile email` (`profile` is required for `rout_handle`).",
    "",
    "## Sign-in flow",
    "1. Read all endpoints from the discovery URL; never hardcode them.",
    "2. Authorization Code + PKCE (S256). Generate code_verifier, state and nonce per attempt; keep them in an HttpOnly, Secure, SameSite=Lax cookie.",
    "3. On the callback: check `state`, exchange the code on the server, validate the id_token via JWKS (ES256: iss, aud === client_id, exp, nonce).",
    "4. Call the UserInfo endpoint with the access token and read `sub` and `rout_handle`.",
    "5. Upsert the user by `rout_id = sub` (never by handle — handles can change). Set `username = rout_handle` on every login.",
    "6. Create your own session cookie; never expose tokens to client-side JavaScript.",
    "7. Map `?error=` values (access_denied, login_required, invalid_request…) to friendly messages.",
    "",
    "## Database",
    "- users: `rout_id text unique not null`, `username text unique not null`, `email`, `email_verified`.",
    "- Users must not be able to edit `username` in your UI; show it as '@handle · managed by ROUT'.",
    "- Conflict: if another local row still holds that username (stale), clear it on that row first inside the same transaction.",
    "",
    ...brandingSection(),
    "",
    "## Tests to write",
    "- First login creates a user with username = rout_handle.",
    "- Second login with a changed handle updates the username.",
    "- A username already held by a stale local row is cleared there first, in the same transaction.",
  ].join("\n");
}

export function buildBadgePrompt(app: PromptApp, tool: AiTool = "generic", stack: Stack = "other"): string {
  return [
    ...promptIntro(tool, stack),
    `I want to integrate the ROUT Badge Issuance API into "${app.name}" (client_id ${app.clientId}) to send digital certificates to users' ROUT profiles.`,
    "NOTE: this API is NOT implemented in the current ROUT release. Do not call it, enable issuance, show success, or fabricate returned badge IDs. Prepare an adapter disabled by default behind ROUT_BADGES_ENABLED; enable it only after the deployed endpoint and its published contract have been verified. The following contract is proposed, not a working integration.",
    `Please build a backend service that makes an authenticated POST request to \`${ROUT_ISSUER}/api/v1/badges/issue\`.`,
    "Include the Authorization Header: `Bearer <YOUR_SECRET_API_KEY>` read from env var ROUT_API_KEY (server only, never in the browser).",
    "Also send an `Idempotency-Key` header (UUID per certificate) so retries never create duplicate badges.",
    "",
    "## Request body",
    "```json",
    '{ "recipient_handle": "anna", "badge_slug": "course-completed", "issue_date": "2026-10-10",',
    '  "metadata": { "title": "Course completed", "description": "Finished the Advanced course", "verification_url": "https://example.com/verify/abc" } }',
    "```",
    "",
    "## Responses",
    "- 201 Created → store the returned badge id and show a success toast.",
    "- 404 Handle Not Found → show 'This ROUT handle does not exist' and let the admin correct it.",
    "- 401/403 → log and alert: the API key is wrong or lacks permission.",
    "- 429 or 5xx → retry with exponential backoff (max 5 tries) using the same Idempotency-Key.",
    "",
    "## Deliverables",
    "- A server function/route `issueBadge(input)` with input validation (zod).",
    "- An admin UI form with the fields above and a success/error toast.",
    "- A table `issued_badges` (id, recipient_handle, badge_slug, rout_badge_id, idempotency_key unique, created_at).",
  ].join("\n");
}

export const WEBHOOK_VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRoutSignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // replay window 5 min
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const got = Buffer.from(parts.v1 ?? "", "hex");
  return got.length === 32 && timingSafeEqual(got, Buffer.from(expected, "hex"));
}`;

/** Body of the one webhook ROUT sends today (backchannel.ts `emailUpdatedEvent`). */
export function emailUpdatedSample(): string {
  return JSON.stringify(
    {
      event: "https://schemas.rout.be/events/user-email-updated",
      sub: "pw_3kq9…(app-specific)",
      previous_email: "old@example.com",
      new_email: "new@example.com",
      updated_at: 1791628800,
    },
    null,
    2,
  );
}

/* ------------------------------------------------------- change prompts */

/** The settings a prompt depends on; stored as a snapshot once a prompt was used. */
export type PromptSnapshot = Pick<TemplateApp, "clientId" | "scopes" | "redirectUris" | "requirePkce" | "richIdentityEnabled" | "accountDiscoveryEnabled" | "handleSyncEnabled">;

export function promptSnapshot(app: TemplateApp): PromptSnapshot {
  return {
    clientId: app.clientId,
    scopes: [...app.scopes].sort(),
    redirectUris: [...app.redirectUris],
    requirePkce: app.requirePkce,
    richIdentityEnabled: app.richIdentityEnabled,
    accountDiscoveryEnabled: app.accountDiscoveryEnabled,
    handleSyncEnabled: Boolean(app.handleSyncEnabled),
  };
}

const TOGGLES: { key: "richIdentityEnabled" | "accountDiscoveryEnabled" | "handleSyncEnabled"; feature: string; label: string }[] = [
  { key: "richIdentityEnabled", feature: "rich", label: "Rich Identity (rout_public_activity)" },
  { key: "accountDiscoveryEnabled", feature: "discovery", label: "Account Discovery" },
  { key: "handleSyncEnabled", feature: "handle", label: "Universal Handle Sync (rout_handle)" },
];

/**
 * A prompt for only what changed since `prev`, so the developer's AI edits the
 * existing ROUT integration instead of rebuilding it. Null when nothing changed.
 */
export function buildChangePrompt(prev: PromptSnapshot, nextApp: TemplateApp, tool: AiTool, stack: Stack): string | null {
  const next = promptSnapshot(nextApp);
  const added = next.scopes.filter((s) => !prev.scopes.includes(s));
  const removed = prev.scopes.filter((s) => !next.scopes.includes(s));
  const newUris = next.redirectUris.filter((u) => !prev.redirectUris.includes(u));
  const goneUris = prev.redirectUris.filter((u) => !next.redirectUris.includes(u));
  const features = featureInstructions(nextApp);
  const changes: string[] = [];
  const todo: string[] = [];

  for (const s of added) {
    changes.push(`- Scope added: \`${s}\``);
    todo.push(`- Add \`${s}\` to the requested scopes.${SCOPE_CLAIMS[s]?.length ? ` New claims: ${SCOPE_CLAIMS[s]!.join(", ")}.` : ""}`);
    if (features[s]) todo.push(...features[s]!);
  }
  const verifyScopes = ["sybil:verify", "identity:legal_name"];
  const hadVerify = prev.scopes.some((s) => verifyScopes.includes(s));
  if (!hadVerify && added.some((s) => verifyScopes.includes(s)) && features["verify-step"]) todo.push(...features["verify-step"]!);
  for (const s of removed) {
    changes.push(`- Scope removed: \`${s}\``);
    todo.push(`- Stop requesting \`${s}\`.${SCOPE_CLAIMS[s]?.length ? ` Treat ${SCOPE_CLAIMS[s]!.join(", ")} as absent; never fail login on it, and stop showing or overwriting that data.` : ""}`);
  }
  for (const t of TOGGLES) {
    if (Boolean(prev[t.key]) === Boolean(next[t.key])) continue;
    if (next[t.key]) {
      changes.push(`- Turned on: ${t.label}`);
      todo.push(...(features[t.feature] ?? []));
    } else {
      changes.push(`- Turned off: ${t.label}`);
      todo.push(`- ${t.label} is off: the related claim no longer arrives. Remove the code path that depends on it and keep existing rows unchanged.`);
    }
  }
  if (prev.requirePkce !== next.requirePkce) {
    changes.push(`- PKCE is now ${next.requirePkce ? "required" : "optional"}`);
    todo.push(next.requirePkce ? "- Make sure every authorization request sends code_challenge (S256) and the token request sends code_verifier." : "- Keep using PKCE S256 anyway; it stays recommended.");
  }
  if (newUris.length || goneUris.length) {
    changes.push(`- Redirect URIs changed${newUris.length ? ` (added: ${newUris.join(", ")})` : ""}${goneUris.length ? ` (removed: ${goneUris.join(", ")})` : ""}`);
    todo.push(`- Use exactly one of these registered redirect URIs, byte-for-byte: ${next.redirectUris.join(" , ") || "NONE — ask for one before continuing"}. Remove any code that still sends a removed URI.`);
  }
  if (!changes.length) return null;
  return [
    ...promptIntro(tool, stack),
    `My app already has a working "Login with ROUT" integration (client_id ${next.clientId}, discovery ${DISCOVERY_URL}). Do NOT rebuild or replace it.`,
    "Change only what is listed below and keep the official ROUT button and logo exactly as they are.",
    "",
    "## What changed in my ROUT settings",
    ...changes,
    "",
    "## Do exactly this",
    ...todo,
    "",
    "## Then",
    "- Update or add tests for the changed behaviour only.",
  ].join("\n");
}
