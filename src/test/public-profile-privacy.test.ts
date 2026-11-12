import { describe, expect, it } from "vitest";
import { parseDisplayPrefs } from "@/lib/profile-display";
import { mergeTimeline, redactPrivateProfile } from "@/lib/public-timeline";

describe("public profile privacy", () => {
  it("defaults to a public profile with a visible timeline", () => {
    const p = parseDisplayPrefs({});
    expect(p.publicProfile).toBe(true);
    expect(p.timelineVisible).toBe(true);
  });

  it("private profile hides bio and links from visitors", () => {
    const row = { id: "x", username: "jona", bio: "hi", blocks: [{ a: 1 }], avatar_url: "u" };
    const out = redactPrivateProfile(row, { publicProfile: false }) as Record<string, unknown>;
    expect(out["bio"]).toBeNull();
    expect(out["blocks"]).toEqual([]);
    expect(out["avatar_url"]).toBeNull();
    expect(out["username"]).toBe("jona");
  });

  it("timeline is newest first", () => {
    const mk = (id: string, d: string) => ({ id, kind: "badge", title: id, detail: null, source: "rout", occurred_at: d });
    const out = mergeTimeline([mk("old", "2025-01-01T00:00:00Z")], [mk("new", "2026-01-01T00:00:00Z")]);
    expect(out.map((i) => i.id)).toEqual(["new", "old"]);
  });
});
