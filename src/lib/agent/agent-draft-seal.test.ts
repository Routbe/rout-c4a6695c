import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createEnvelope,
  mergeDraftPatch,
  openApps,
  openDraft,
  resealDraft,
  sealApps,
  sealedEnvelope,
  unwrapDataKey,
  SEAL_MARKER,
} from "./agent-draft-seal";

const secrets = { key: "rsk_" + "a".repeat(40), token: "b".repeat(64), code: "ROUTABCDEFGHJKMNPQRSTVWXYZ0" };
const sid = "6f1c1b62-0000-4000-8000-000000000001";
const draft = { displayName: "Agent Bakery", tagline: "Fresh bread", displayPrefs: { accentColor: "#ff6600" } };

describe("unclaimed agent designs are encrypted at rest", () => {
  it("stores no readable design text", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    const stored = JSON.stringify({ [SEAL_MARKER]: env });
    expect(stored).not.toContain("Agent Bakery");
    expect(stored).not.toContain("Fresh bread");
    expect(stored).not.toContain("#ff6600");
    for (const s of Object.values(secrets)) expect(stored).not.toContain(s);
  });

  it("opens with the agent key, the claim link and the claim code", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    for (const p of ["key", "token", "code"] as const) {
      const dk = await unwrapDataKey(env, p, secrets[p]);
      expect(await openDraft(env, dk)).toEqual(draft);
    }
  });

  it("refuses a wrong secret or a secret used for another purpose", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    await expect(unwrapDataKey(env, "token", "c".repeat(64))).rejects.toThrow("seal_secret_mismatch");
    await expect(unwrapDataKey(env, "code", secrets.token)).rejects.toThrow("seal_secret_mismatch");
  });

  it("an envelope moved to another sandbox does not open", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    await expect(unwrapDataKey({ ...env, sid: "other" }, "key", secrets.key)).rejects.toThrow("seal_secret_mismatch");
  });

  it("agent edits re-seal with a fresh nonce under the same wraps", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    const dk = await unwrapDataKey(env, "key", secrets.key);
    const next = await resealDraft(env, dk, mergeDraftPatch(draft, { tagline: "Sourdough", username: "hijack" }, { buttonShape: "icon" }));
    expect(next.iv).not.toBe(env.iv);
    expect(next.wraps).toEqual(env.wraps);
    const opened = await openDraft(next, await unwrapDataKey(next, "code", secrets.code));
    expect(opened).toEqual({ ...draft, tagline: "Sourdough", displayPrefs: { accentColor: "#ff6600", buttonShape: "icon" } });
  });

  it("login-app specs are sealed too; legacy plaintext passes through", async () => {
    const env = await createEnvelope(draft, secrets, sid);
    const dk = await unwrapDataKey(env, "key", secrets.key);
    const apps = [{ name: "Bakery login", redirect_uris: ["https://bakery.example/cb"], scopes: ["openid"] }];
    const sealed = await sealApps(apps, dk, sid);
    expect(JSON.stringify(sealed)).not.toContain("Bakery login");
    expect(await openApps(sealed, dk, sid)).toEqual(apps);
    expect(await openApps(apps, null, null)).toEqual(apps);
    expect(await openApps(sealed, null, null)).toEqual([]);
  });

  it("recognises only real envelopes", async () => {
    expect(sealedEnvelope({ displayName: "x" })).toBeNull();
    expect(sealedEnvelope({ [SEAL_MARKER]: { v: 1 } })).toBeNull();
    expect(sealedEnvelope({ [SEAL_MARKER]: await createEnvelope(draft, secrets, sid) })).not.toBeNull();
  });
});

/** In-memory stand-in for the db/0202 functions and the owner's draft row. */
const db = vi.hoisted(() => ({
  draft: null as unknown,
  revision: 1,
  apps: [] as unknown,
  claimed: false,
  owner: null as string | null,
}));

vi.mock("@/lib/neon", () => {
  const run = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("rout_agent_sandbox_provision")) {
      db.draft = JSON.parse(String(values[6]));
      return [{ workspace_id: "ws1", slug: "bakery", expires_at: "2026-11-07T00:00:00Z" }];
    }
    if (q.includes("rout_agent_sandbox_state")) return db.claimed ? [] : [{ draft: db.draft, revision: db.revision, apps: db.apps }];
    if (q.includes("rout_agent_sandbox_patch_draft")) {
      const fields = JSON.parse(String(values[1])) as Record<string, unknown>;
      db.draft = { ...(db.draft as object), ...fields, displayPrefs: {} };
      db.revision += 1;
      return [{ revision: db.revision }];
    }
    if (q.includes("rout_agent_sandbox_set_apps")) { db.apps = JSON.parse(String(values[1])); return [{ n: 1 }]; }
    if (q.includes("rout_claim_agent_workspace_v2")) {
      if (db.claimed) throw new Error("claim_used");
      db.claimed = true; db.owner = "human1";
      const apps = db.apps; db.apps = [];
      return [{ workspace_id: "ws1", slug: "bakery", pending_apps: apps }];
    }
    if (q.includes("select payload from public.workspace_profile_drafts")) return [{ payload: db.draft }];
    if (q.includes("update public.workspace_profile_drafts")) {
      if (sealedEnvelope(db.draft)) db.draft = JSON.parse(String(values[0]));
      return [];
    }
    if (q.includes("from public.workspace_profile_drafts d")) return sealedEnvelope(db.draft) && db.owner === values[0] ? [{ workspace_id: "ws1", slug: "bakery" }] : [];
    throw new Error("unexpected query: " + q);
  };
  return { sql: run, withDbContext: async (_ctx: unknown, fn: () => unknown) => fn() };
});
vi.mock("@/lib/oauth/provider.server", () => ({
  createClient: vi.fn(async (_u: string, input: { name: string }) => ({ client: { name: input.name, clientId: "cid_1" }, clientSecret: "sec_1" })),
}));

describe("AI → human handoff (end to end over the server code)", () => {
  beforeEach(() => { db.draft = null; db.revision = 1; db.apps = []; db.claimed = false; db.owner = null; });

  it("agent builds sealed, human claims with the link and gets the plain design and live apps", async () => {
    const sandbox = await import("./agent-sandbox.server");
    const ctx = { key: secrets.key, keyHash: "h".repeat(64), sandboxId: sid, agentName: "Builder", workspaceId: null, slug: null, expiresAt: "" };
    const ws = await sandbox.provisionSandboxWorkspace(ctx, { name: "Bakery", slug: "bakery" });
    expect(JSON.stringify(db.draft)).not.toContain("Bakery");

    await sandbox.patchSandboxProfile(ctx, { displayName: "Agent Bakery" }, { accentColor: "#ff6600" });
    await sandbox.setSandboxApps(ctx, [{ name: "Bakery login", redirect_uris: ["https://bakery.example/cb"], scopes: ["openid"] }] as never);
    expect(JSON.stringify(db.draft)).not.toContain("Agent Bakery");
    expect(JSON.stringify(db.apps)).not.toContain("Bakery login");

    const seen = await sandbox.readSandboxState(ctx);
    expect((seen?.draft as Record<string, unknown>)["displayName"]).toBe("Agent Bakery");

    const { claimAgentWorkspace } = await import("./agent-workspaces.server");
    const result = await claimAgentWorkspace("human1", "hash", { purpose: "token", value: ws.claimToken });
    expect(result.draftRestored).toBe(true);
    expect(result.apps.map((a) => a.name)).toEqual(["Bakery login"]);
    expect(sealedEnvelope(db.draft)).toBeNull();
    expect((db.draft as Record<string, unknown>)["displayName"]).toBe("Agent Bakery");
    expect((db.draft as { displayPrefs: Record<string, unknown> }).displayPrefs["accentColor"]).toBe("#ff6600");
  });

  it("the typed claim code opens it too", async () => {
    const sandbox = await import("./agent-sandbox.server");
    const { normalizeClaimCode } = await import("./agent-sandbox");
    const ctx = { key: secrets.key, keyHash: "h".repeat(64), sandboxId: sid, agentName: "Builder", workspaceId: null, slug: null, expiresAt: "" };
    const ws = await sandbox.provisionSandboxWorkspace(ctx, { name: "Code Shop", slug: "code-shop" });
    const { claimAgentWorkspace } = await import("./agent-workspaces.server");
    const result = await claimAgentWorkspace("human1", "hash", { purpose: "code", value: normalizeClaimCode(ws.claimCode)! });
    expect(result.draftRestored).toBe(true);
    expect(sealedEnvelope(db.draft)).toBeNull();
  });

  it("an interrupted handoff is finished by the claimer with the same link", async () => {
    const sandbox = await import("./agent-sandbox.server");
    const ctx = { key: secrets.key, keyHash: "h".repeat(64), sandboxId: sid, agentName: "Builder", workspaceId: null, slug: null, expiresAt: "" };
    const ws = await sandbox.provisionSandboxWorkspace(ctx, { name: "Bakery", slug: "bakery" });
    const { claimAgentWorkspace, recoverSealedAgentDraft } = await import("./agent-workspaces.server");
    // Claim without the secret simulates a crash before the design was opened.
    await claimAgentWorkspace("human1", "hash");
    expect(sealedEnvelope(db.draft)).not.toBeNull();
    expect(await recoverSealedAgentDraft("someone-else", { purpose: "token", value: ws.claimToken })).toBeNull();
    expect(await recoverSealedAgentDraft("human1", { purpose: "token", value: "0".repeat(64) })).toBeNull();
    expect(await recoverSealedAgentDraft("human1", { purpose: "token", value: ws.claimToken })).toEqual({ workspaceId: "ws1", slug: "bakery" });
    expect(sealedEnvelope(db.draft)).toBeNull();
  });

  it("the agent key stops working once claimed", async () => {
    const sandbox = await import("./agent-sandbox.server");
    const ctx = { key: secrets.key, keyHash: "h".repeat(64), sandboxId: sid, agentName: "Builder", workspaceId: null, slug: null, expiresAt: "" };
    const ws = await sandbox.provisionSandboxWorkspace(ctx, { name: "Bakery", slug: "bakery" });
    const { claimAgentWorkspace } = await import("./agent-workspaces.server");
    await claimAgentWorkspace("human1", "hash", { purpose: "token", value: ws.claimToken });
    await expect(sandbox.patchSandboxProfile(ctx, { tagline: "late" }, {})).rejects.toThrow("sandbox_invalid");
  });
});
