import { describe, expect, it, vi } from "vitest";
import { applyTourDraftToUser, type DraftApplyDeps } from "@/lib/tour-draft-apply.server";
import { EMPTY_TOUR_DRAFT } from "@/lib/tour-draft";

const draft = { ...EMPTY_TOUR_DRAFT, token: "tok12345", handle: "jona.test", displayName: "Jona", bio: "Hi", socials: { instagram: "@jona" } };
const NOW = 1_800_000_000_000;

function deps(over: Partial<DraftApplyDeps> = {}): DraftApplyDeps {
  return {
    readAccount: async () => ({ handle: "jona4827", createdAt: new Date(NOW - 60_000) }),
    claimHandle: vi.fn(async (_u, h) => ({ ok: true, handle: h })),
    writeProfile: vi.fn(async () => ({})),
    now: () => NOW,
    ...over,
  };
}

describe("applyTourDraftToUser", () => {
  it("applies the draft to a new account", async () => {
    const d = deps();
    expect(await applyTourDraftToUser("u1", draft, d)).toBe("applied");
    expect(d.writeProfile).toHaveBeenCalledWith("u1", expect.objectContaining({ username: "jona.test", displayName: "Jona" }));
  });

  it("falls back to onboarding when the handle is taken, still saving other choices", async () => {
    const d = deps({ claimHandle: vi.fn(async () => ({ ok: false })) });
    expect(await applyTourDraftToUser("u1", draft, d)).toBe("handle_taken");
    expect(d.writeProfile).toHaveBeenCalledWith("u1", expect.objectContaining({ username: "jona4827", tagline: "Hi" }));
  });

  it("never overwrites an existing member", async () => {
    const d = deps({ readAccount: async () => ({ handle: "old", createdAt: new Date(NOW - 86_400_000) }) });
    expect(await applyTourDraftToUser("u1", draft, d)).toBe("skipped");
    expect(d.writeProfile).not.toHaveBeenCalled();
    expect(d.claimHandle).not.toHaveBeenCalled();
  });
});
