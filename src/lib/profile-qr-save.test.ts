import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, sql } = vi.hoisted(() => {
  const state = { calls: [] as { query: string; values: unknown[] }[], transaction: vi.fn() };
  const tag = Object.assign((parts: TemplateStringsArray, ...values: unknown[]) => {
    const statement = { query: parts.join("?"), values };
    state.calls.push(statement);
    return statement;
  }, { transaction: state.transaction });
  return { state, sql: tag };
});
vi.mock("@/lib/neon", () => ({ sql }));
import { savePublishedProfileQr } from "./profile-drafts.server";

describe("standalone profile QR save", () => {
  beforeEach(() => { state.calls.length = 0; state.transaction.mockReset().mockResolvedValue([[{ id: "owner" }], []]); });
  it("atomically updates owner live and draft QR with a revision protecting against stale publication", async () => {
    const style = { fgColor: "#112233", bgColor: "transparent", cornerStyle: "dots" as const, emblem: false, bgGradient: "linear-gradient(135deg, #ffffff, #112233)" };
    await savePublishedProfileQr("owner", style);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.calls).toHaveLength(3);
    for (const call of state.calls) {
      expect(call.values).toContain("owner");
      expect(call.values).toContain(JSON.stringify(style));
    }
    expect(state.calls[1]?.query).toContain("revision = revision + 1");
    // Root and alias drafts both get the QR, and the alias profile shows it too.
    expect(state.calls[1]?.query).not.toContain("space = 'verified'");
    expect(state.calls[2]?.query).toContain("alias_profiles");
    expect(state.calls[1]?.query).toContain("published_revision = case when published_revision = revision");
  });
  it("does not report success for a missing profile", async () => {
    state.transaction.mockResolvedValue([[], []]);
    await expect(savePublishedProfileQr("missing", { fgColor: "#000000", bgColor: "#ffffff", cornerStyle: "square", emblem: false })).rejects.toThrow("profile_not_found");
  });
});