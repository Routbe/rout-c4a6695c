import { sql } from "@/lib/neon";
import { agentError } from "./responses";
import {
  claimCodeHashInput,
  generateClaimCode,
  generateSandboxKey,
  isSandboxKey,
  normalizeClaimCode,
  sha256Hex,
  signChallenge,
  verifyChallenge,
  type SandboxAppSpec,
} from "./agent-sandbox";
import { generateClaimToken, hashClaimToken } from "./agent-claims";
import { seedWorkspaceStudio } from "@/lib/workspace-studio";

/**
 * Account-less agent sandboxes (db/0202). Every state change goes through the
 * SECURITY DEFINER `rout_agent_sandbox_*` functions; this module only hashes
 * secrets and never logs them.
 */

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function powSecret(): string {
  const s = process.env["POW_SECRET"] || process.env["BETTER_AUTH_SECRET"];
  if (!s || s.length < 32) throw new Error("pow_secret_missing");
  return s;
}

export async function issueChallenge(): Promise<{ challenge: string; difficulty_bits: number; expires_in: number }> {
  const { POW_DIFFICULTY_BITS, POW_TTL_S } = await import("./agent-sandbox");
  const challenge = await signChallenge(powSecret(), Math.floor(Date.now() / 1000), rnd(16));
  return { challenge, difficulty_bits: POW_DIFFICULTY_BITS, expires_in: POW_TTL_S };
}

export async function registerSandbox(input: { challenge: string; solution: string; agentName: string; ip: string }) {
  const check = await verifyChallenge(powSecret(), input.challenge, input.solution, Math.floor(Date.now() / 1000));
  if (!check.ok) throw new Error(`challenge_${check.reason}`);
  const key = generateSandboxKey(rnd);
  const { rateLimitKey } = await import("@/lib/qa/privacy-keys.server");
  const ipBucket = await rateLimitKey("agent-sandbox", input.ip);
  const rows = (await sql`select sandbox_id, expires_at from public.rout_agent_sandbox_register(
      ${await sha256Hex(key)}, ${await sha256Hex(input.challenge)}, ${ipBucket}, ${input.agentName})`) as Array<{ sandbox_id: string; expires_at: string }>;
  const row = rows[0];
  if (!row) throw new Error("register_failed");
  return { sandboxKey: key, sandboxId: row.sandbox_id, expiresAt: row.expires_at };
}

export type SandboxContext = {
  /** Raw `rsk_` key of this request: derives the draft unwrap key, never stored or logged. */
  key: string;
  keyHash: string;
  sandboxId: string;
  agentName: string;
  workspaceId: string | null;
  slug: string | null;
  expiresAt: string;
};

/** Bearer `rsk_…` gate. Returns a structured error Response on failure. */
export async function authenticateSandbox(request: Request): Promise<SandboxContext | Response> {
  const { guardRequest } = await import("@/lib/api-guard.server");
  const limited = guardRequest(request, "agent-sandbox", 60, 60_000);
  if (limited) return agentError(429, "rate_limited", "Too many sandbox requests. Retry later.");
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  if (!isSandboxKey(token)) return agentError(401, "invalid_token", "Send your sandbox key as `Authorization: Bearer rsk_…`.");
  const keyHash = await sha256Hex(token);
  const rows = (await sql`select sandbox_id, agent_name, workspace_id, slug, expires_at, claimed
      from public.rout_agent_sandbox_context(${keyHash})`) as Array<{
    sandbox_id: string; agent_name: string; workspace_id: string | null; slug: string | null; expires_at: string; claimed: boolean | null;
  }>;
  const r = rows[0];
  if (!r) return agentError(401, "invalid_token", "This sandbox key is invalid, expired or already claimed.");
  return { key: token, keyHash, sandboxId: r.sandbox_id, agentName: r.agent_name, workspaceId: r.workspace_id, slug: r.slug, expiresAt: r.expires_at };
}

export async function provisionSandboxWorkspace(ctx: SandboxContext, input: { name: string; slug: string; description?: string }) {
  const token = generateClaimToken(rnd);
  const code = generateClaimCode(rnd);
  const draft = seedWorkspaceStudio({ slug: input.slug, name: input.name, avatarUrl: null }, null);
  // Encrypted at rest until a human claims it: only the agent key, the link or the code can open it.
  const { createEnvelope, SEAL_MARKER } = await import("./agent-draft-seal");
  const sealed = { [SEAL_MARKER]: await createEnvelope(draft, { key: ctx.key, token, code: normalizeClaimCode(code)! }, ctx.sandboxId) };
  const rows = (await sql`select workspace_id, slug, expires_at from public.rout_agent_sandbox_provision(
      ${ctx.keyHash}, ${input.name}, ${input.slug}, ${input.description ?? null},
      ${await hashClaimToken(token)}, ${await sha256Hex(claimCodeHashInput(normalizeClaimCode(code)!))}, ${JSON.stringify(sealed)}::jsonb)`) as Array<{
    workspace_id: string; slug: string; expires_at: string;
  }>;
  const row = rows[0];
  if (!row) throw new Error("provision_failed");
  // The database may append a suffix to keep the slug unique: the sealed draft must carry the real one.
  if (row.slug !== input.slug) await syncDraftUsername({ ...ctx, workspaceId: row.workspace_id, slug: row.slug }, row.slug);
  return { workspaceId: row.workspace_id, slug: row.slug, expiresAt: row.expires_at, claimToken: token, claimCode: code };
}

/** Sets the locked `username` field of the sealed draft to the slug the database actually assigned. */
async function syncDraftUsername(ctx: SandboxContext, slug: string): Promise<void> {
  const state = await rawSandboxState(ctx);
  if (!state) return;
  const { openDraft, resealDraft, SEAL_MARKER } = await import("./agent-draft-seal");
  const patch = await withDataKey(ctx, state.draft, async (dk, env) => {
    if (!dk || !env) return null;
    const draft = await openDraft(env, dk);
    if (draft["username"] === slug) return null;
    return { [SEAL_MARKER]: await resealDraft(env, dk, { ...draft, username: slug }) };
  });
  if (!patch) return;
  await sql`select revision from public.rout_agent_sandbox_patch_draft(${ctx.keyHash}, ${JSON.stringify(patch)}::jsonb, ${"{}"}::jsonb)`;
}

async function rawSandboxState(ctx: SandboxContext) {
  const rows = (await sql`select draft, revision, apps from public.rout_agent_sandbox_state(${ctx.keyHash})`) as Array<{
    draft: unknown; revision: number; apps: unknown;
  }>;
  return rows[0] ?? null;
}

/** Runs `fn` with the unwrapped data key of a sealed draft; the key is wiped afterwards. */
async function withDataKey<T>(ctx: SandboxContext, draft: unknown, fn: (dk: Uint8Array | null, env: import("./agent-draft-seal").Envelope | null) => Promise<T>): Promise<T> {
  const { sealedEnvelope, unwrapDataKey } = await import("./agent-draft-seal");
  const env = sealedEnvelope(draft);
  if (!env) return fn(null, null); // provisioned before encryption at rest: stays plaintext until it expires
  const dk = await unwrapDataKey(env, "key", ctx.key);
  try {
    return await fn(dk, env);
  } finally {
    dk.fill(0);
  }
}

export async function setSandboxApps(ctx: SandboxContext, apps: SandboxAppSpec[]): Promise<number> {
  const state = await rawSandboxState(ctx);
  if (!state) throw new Error("sandbox_invalid");
  const { sealApps } = await import("./agent-draft-seal");
  const stored = await withDataKey(ctx, state.draft, async (dk, env) => (dk && env && apps.length ? sealApps(apps, dk, env.sid) : apps));
  await sql`select public.rout_agent_sandbox_set_apps(${ctx.keyHash}, ${JSON.stringify(stored)}::jsonb) as n`;
  return apps.length;
}

export async function patchSandboxProfile(ctx: SandboxContext, fields: Record<string, unknown>, prefs: Record<string, unknown>): Promise<number> {
  const state = await rawSandboxState(ctx);
  if (!state) throw new Error("sandbox_invalid");
  const { mergeDraftPatch, openDraft, resealDraft, SEAL_MARKER } = await import("./agent-draft-seal");
  const [patchFields, patchPrefs] = await withDataKey(ctx, state.draft, async (dk, env) => {
    if (!dk || !env) return [fields, prefs] as const;
    const next = mergeDraftPatch(await openDraft(env, dk), fields, prefs);
    // The db function merges shallowly, so replacing the marker key swaps the whole ciphertext.
    return [{ [SEAL_MARKER]: await resealDraft(env, dk, next) }, {}] as const;
  });
  const rows = (await sql`select revision from public.rout_agent_sandbox_patch_draft(
      ${ctx.keyHash}, ${JSON.stringify(patchFields)}::jsonb, ${JSON.stringify(patchPrefs)}::jsonb)`) as Array<{ revision: number }>;
  const row = rows[0];
  if (!row) throw new Error("sandbox_invalid");
  // A parallel patch from the same agent would have been overwritten: say so instead of hiding it.
  if (Number(row.revision) !== Number(state.revision) + 1) throw new Error("draft_conflict");
  return Number(row.revision);
}

/** Decrypted view for the agent holding the key. */
export async function readSandboxState(ctx: SandboxContext) {
  const state = await rawSandboxState(ctx);
  if (!state) return null;
  const { openApps, openDraft } = await import("./agent-draft-seal");
  return withDataKey(ctx, state.draft, async (dk, env) => ({
    draft: dk && env ? await openDraft(env, dk) : state.draft,
    revision: state.revision,
    apps: await openApps(state.apps, dk, env?.sid ?? null),
  }));
}

/** QR code (SVG) for the claim link, drawn by ROUT itself. */
export async function claimQrSvg(url: string): Promise<string> {
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}
