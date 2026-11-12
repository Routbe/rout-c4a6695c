import { sql, withDbContext } from "@/lib/neon";
import { generateClaimToken, hashClaimToken } from "./agent-claims";

/**
 * Server side of agent-provisioned workspaces. All state changes go through
 * the SECURITY DEFINER functions from migration 0164; rout_app holds only
 * EXECUTE on them and can never see a token hash.
 */

export type ProvisionedWorkspace = {
  workspaceId: string;
  slug: string;
  expiresAt: string;
  claimToken: string;
};

/** Create one unowned staging workspace for an agent. Throws the DB error text. */
export async function provisionAgentWorkspace(input: {
  userId: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
}): Promise<ProvisionedWorkspace> {
  const claimToken = generateClaimToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  const tokenHash = await hashClaimToken(claimToken);
  const rows = await withDbContext({ userId: input.userId, workspaceId: null }, async () => {
    return (await sql`
      select workspace_id, slug, expires_at
        from public.rout_agent_provision_workspace(
          ${input.clientId}, ${input.name}, ${input.slug}, ${input.description ?? null}, ${tokenHash}
        )
    `) as Array<{ workspace_id: string; slug: string; expires_at: string }>;
  });
  const row = rows[0];
  if (!row) throw new Error("provision_failed");
  return { workspaceId: row.workspace_id, slug: row.slug, expiresAt: row.expires_at, claimToken };
}

export type AgentClaimPreview = {
  name: string;
  slug: string;
  expiresAt: string;
  claimed: boolean;
  expired: boolean;
  appName: string | null;
};

/** Preview for the claim page. Signed-in humans only; never returns the hash. */
export async function previewAgentClaim(userId: string, tokenHash: string): Promise<AgentClaimPreview | null> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    return (await sql`
      select name, slug, expires_at, claimed, expired, app_name
        from public.rout_agent_claim_preview(${tokenHash})
    `) as Array<{ name: string; slug: string; expires_at: string; claimed: boolean; expired: boolean; app_name: string | null }>;
  });
  const row = rows[0];
  if (!row) return null;
  return { name: row.name, slug: row.slug, expiresAt: row.expires_at, claimed: row.claimed, expired: row.expired, appName: row.app_name };
}

export type ClaimedApp = { name: string; clientId: string; clientSecret: string };

/** The claim secret the human holds: link token or normalised claim code. Never stored. */
export type ClaimSecret = { purpose: "token" | "code"; value: string };

/**
 * Opens a sealed agent draft with the claim secret and stores it as the owner's
 * normal draft. Conditional on the payload still being sealed, so a retry is a no-op.
 * Returns the data key (caller wipes it) or null when the draft was not sealed.
 */
async function unsealDraftAsOwner(userId: string, workspaceId: string, secret: ClaimSecret): Promise<{ dk: Uint8Array; sid: string } | null> {
  const { openDraft, sealedEnvelope, unwrapDataKey } = await import("./agent-draft-seal");
  return withDbContext({ userId, workspaceId }, async () => {
    const rows = (await sql`select payload from public.workspace_profile_drafts where workspace_id = ${workspaceId} limit 1`) as Array<{ payload: unknown }>;
    const env = sealedEnvelope(rows[0]?.payload);
    if (!env) return null;
    const dk = await unwrapDataKey(env, secret.purpose, secret.value);
    const draft = await openDraft(env, dk);
    await sql`update public.workspace_profile_drafts
         set payload = ${JSON.stringify(draft)}::jsonb, revision = revision + 1, updated_by = ${userId}, updated_at = now()
       where workspace_id = ${workspaceId} and payload ? '$sealed'`;
    return { dk, sid: env.sid };
  });
}

/**
 * Recovery for an interrupted handoff: the claim went through but the draft is
 * still sealed. Only the claimer's own owned workspaces are tried, and only the
 * one whose wrap opens with this secret (AES-GCM authenticates it) is restored.
 */
export async function recoverSealedAgentDraft(userId: string, secret: ClaimSecret): Promise<{ workspaceId: string; slug: string } | null> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () =>
    (await sql`select d.workspace_id, w.slug from public.workspace_profile_drafts d
        join public.workspace_members m on m.workspace_id = d.workspace_id and m.user_id = ${userId} and m.role = 'owner'
        join public.workspaces w on w.id = d.workspace_id
       where d.payload ? '$sealed' order by d.updated_at desc limit 20`) as Array<{ workspace_id: string; slug: string }>,
  );
  for (const r of rows) {
    try {
      const opened = await unsealDraftAsOwner(userId, r.workspace_id, secret);
      opened?.dk.fill(0);
      if (opened) return { workspaceId: r.workspace_id, slug: r.slug };
    } catch {
      /* not this workspace's secret */
    }
  }
  return null;
}

/**
 * Claim (link token or claim code hash): the signed-in human becomes Owner,
 * the sandbox key dies, and the agent's login-app specs become real OAuth
 * clients owned by this human. Secrets are returned once. Throws the DB error text.
 */
export async function claimAgentWorkspace(
  userId: string,
  hash: string,
  secret?: ClaimSecret,
): Promise<{ workspaceId: string; slug: string; apps: ClaimedApp[]; draftRestored: boolean }> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    try {
      return (await sql`
        select workspace_id, slug, pending_apps from public.rout_claim_agent_workspace_v2(${hash})
      `) as Array<{ workspace_id: string; slug: string; pending_apps: unknown }>;
    } catch (error) {
      // Before db/0202 is applied: the original link-only claim keeps working.
      if (!/rout_claim_agent_workspace_v2.*does not exist/.test((error as Error).message ?? "")) throw error;
      return (await sql`
        select workspace_id, slug, '[]'::jsonb as pending_apps from public.rout_claim_agent_workspace(${hash})
      `) as Array<{ workspace_id: string; slug: string; pending_apps: unknown }>;
    }
  });
  const row = rows[0];
  if (!row) throw new Error("claim_not_found");
  // Zero-knowledge handoff: the claim secret opens the sealed design and app specs.
  let pending: unknown = row.pending_apps;
  let draftRestored = true;
  if (secret) {
    const { openApps } = await import("./agent-draft-seal");
    let opened: { dk: Uint8Array; sid: string } | null = null;
    try {
      opened = await unsealDraftAsOwner(userId, row.workspace_id, secret);
      if (opened) pending = await openApps(row.pending_apps, opened.dk, opened.sid);
    } catch (error) {
      draftRestored = false;
      console.error("[agent:claim] draft unseal failed:", (error as Error).message);
    } finally {
      opened?.dk.fill(0);
    }
  }
  const { sandboxAppInput } = await import("./agent-sandbox");
  const specs = (Array.isArray(pending) ? pending : [])
    .map((a) => sandboxAppInput.safeParse(a))
    .filter((r) => r.success)
    .map((r) => r.data);
  const apps: ClaimedApp[] = [];
  if (specs.length) {
    const { createClient } = await import("@/lib/oauth/provider.server");
    await withDbContext({ userId, workspaceId: row.workspace_id }, async () => {
      for (const s of specs) {
        try {
          const { client, clientSecret } = await createClient(
            userId,
            {
              name: s.name,
              description: s.description ?? null,
              homepageUrl: s.homepage_url ?? null,
              privacyUrl: s.privacy_url ?? null,
              termsUrl: s.terms_url ?? null,
              redirectUris: s.redirect_uris,
              scopes: s.scopes,
            },
            row.workspace_id,
          );
          apps.push({ name: client.name, clientId: client.clientId, clientSecret });
        } catch (error) {
          console.warn("[agent:claim] app spec skipped:", (error as Error).message);
        }
      }
    });
  }
  return { workspaceId: row.workspace_id, slug: row.slug, apps, draftRestored };
}

/** Cron: hard delete every workspace whose claim expired unclaimed. */
export async function purgeUnclaimedAgentWorkspaces(): Promise<number> {
  const rows = (await sql`select public.rout_purge_unclaimed_agent_workspaces() as purged`) as Array<{ purged: number }>;
  return Number(rows[0]?.purged ?? 0);
}
