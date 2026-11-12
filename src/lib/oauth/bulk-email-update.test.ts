import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<string, { source: string; email: string }>(),
  consents: new Set<string>(),
  notifications: [] as unknown[],
  failTransaction: false,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (handler: unknown) => handler,
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/middleware", () => ({ requireAuth: {} }));
vi.mock("@/lib/auth/step-up-guard.server", () => ({ requirePasskeyStepUp: vi.fn().mockResolvedValue("passkey") }));
vi.mock("@/lib/site-mail.server", () => ({ later: (task: () => unknown) => task() }));
vi.mock("@/lib/auth/email-sync-webhook.server", () => ({
  dispatchEmailUpdated: vi.fn(async (_user: string, changes: unknown[]) => { state.notifications.push(...changes); }),
}));
vi.mock("@/lib/neon", () => {
  const sql = Object.assign((parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?");
    if (query.includes("insert into")) return { clientId: String(values[1]), email: String(values[2]) };
    if (query.includes("from public.users")) return Promise.resolve([{ email: "new@mail.be" }]);
    const selected = values[1] as string[];
    if (query.includes("from public.oauth_consents")) return Promise.resolve(selected.filter((id) => state.consents.has(id)).map((client_id) => ({ client_id })));
    return Promise.resolve(selected.filter((id) => state.rows.has(id)).map((client_id) => ({
      client_id, source: state.rows.get(client_id)?.source, assigned_email: state.rows.get(client_id)?.email,
    })));
  }, {
    transaction: async (changes: { clientId: string; email: string }[]) => {
      if (state.failTransaction) throw new Error("transaction_failed");
      for (const change of changes) state.rows.set(change.clientId, { source: "primary", email: change.email });
    },
  });
  return { sql };
});

import { bulkUpdateAppEmails } from "./connected-apps.functions";
const run = bulkUpdateAppEmails as unknown as (input: { data: { clientIds: string[] }; context: { userId: string } }) => Promise<{ updated: number }>;
beforeEach(() => {
  state.rows.clear(); state.consents.clear(); state.notifications = []; state.failTransaction = false;
  for (const id of ["a", "b", "relay", "untouched", "new-app"]) state.consents.add(id);
  state.rows.set("a", { source: "primary", email: "old@mail.be" });
  state.rows.set("b", { source: "alias", email: "contact@rout.be" });
  state.rows.set("relay", { source: "relay", email: "priv-1@mail.rout.be" });
  state.rows.set("untouched", { source: "primary", email: "old@mail.be" });
});
describe("bulk email updates persist selected connected records", () => {
  it("updates selected primary/alias apps, inserts a missing record and dispatches changes", async () => {
    expect(await run({ data: { clientIds: ["a", "b", "new-app", "relay", "foreign"] }, context: { userId: "u1" } })).toEqual({ updated: 3 });
    for (const id of ["a", "b", "new-app"]) expect(state.rows.get(id)).toEqual({ source: "primary", email: "new@mail.be" });
    expect(state.rows.get("relay")?.email).toBe("priv-1@mail.rout.be");
    expect(state.rows.get("untouched")?.email).toBe("old@mail.be");
    expect(state.rows.has("foreign")).toBe(false);
    expect(state.notifications).toHaveLength(3);
  });
  it("does not dispatch or partially change records after a transaction failure", async () => {
    state.failTransaction = true;
    await expect(run({ data: { clientIds: ["a", "b"] }, context: { userId: "u1" } })).rejects.toThrow("transaction_failed");
    expect(state.rows.get("a")?.email).toBe("old@mail.be");
    expect(state.rows.get("b")?.email).toBe("contact@rout.be");
    expect(state.notifications).toEqual([]);
  });
});