import { describe, expect, it } from "vitest";
import { blockFromUrl, mergeImportedBlocks, parseProfileImport, sanitizeImportedBlock, IMPORT_MAX_BLOCKS } from "./profile-import";
import type { ProfileBlock } from "./profile";

describe("profile import", () => {
  it("restores blocks, name and subtitle from a ROUT export", () => {
    const file = JSON.stringify({
      format: "rout.data-export.v2",
      profile: { display_name: "Jona", tagline: "Maker" },
      blocks: [{ id: "b1", kind: "github", label: "GitHub", value: "jona", pinned: true, size: "small" }],
    });
    const r = parseProfileImport(file);
    if ("error" in r) throw new Error(r.error);
    expect(r.source).toBe("rout");
    expect(r.displayName).toBe("Jona");
    expect(r.tagline).toBe("Maker");
    expect(r.blocks).toEqual([{ id: "b1", kind: "github", label: "GitHub", value: "jona", pinned: true, size: "small" }]);
  });

  it("drops script URLs and unknown fields from imported blocks", () => {
    expect(sanitizeImportedBlock({ kind: "link", label: "x", value: "javascript:alert(1)" })).toBeNull();
    const b = sanitizeImportedBlock({ kind: "link", label: "x", value: "https://a.be", evil: "1", thumbnailUrl: "http://insecure.be/a.png" });
    expect(b && "evil" in b).toBe(false);
    expect(b?.thumbnailUrl).toBeUndefined();
  });

  it("converts a LinkStack export, ordered, with platform detection", () => {
    const file = JSON.stringify({
      name: "Jona",
      littlelink_description: "<p>Hallo</p>",
      links: [
        { title: "Mijn site", link: "https://jona.be", order: 2 },
        { title: "GitHub", link: "https://github.com/jona", order: 1 },
        { title: "Over mij", link: "", type: "heading", order: 3 },
        { title: "Mail", link: "mailto:hi@jona.be", order: 4 },
        { title: "Kapot", link: "javascript:alert(1)", order: 5 },
      ],
    });
    const r = parseProfileImport(file);
    if ("error" in r) throw new Error(r.error);
    expect(r.source).toBe("linkstack");
    expect(r.tagline).toBe("Hallo");
    expect(r.blocks.map((b) => [b.kind, b.value])).toEqual([
      ["github", "jona"],
      ["link", "https://jona.be"],
      ["text", "Over mij"],
      ["email", "hi@jona.be"],
    ]);
    expect(r.skipped).toBe(1);
  });

  it("rejects files that are not exports", () => {
    expect(parseProfileImport("not json")).toEqual({ error: "invalid_json" });
    expect(parseProfileImport(JSON.stringify({ hello: 1 }))).toEqual({ error: "unknown_format" });
  });

  it("maps a plain website URL to a link block named after its host", () => {
    expect(blockFromUrl("https://www.example.org/x", "")).toMatchObject({ kind: "link", label: "example.org" });
  });

  it("append gives imported blocks fresh ids and respects the 100-block cap", () => {
    const current: ProfileBlock[] = Array.from({ length: 98 }, (_, i) => ({ id: `c${i}`, kind: "link", label: "", value: "" }));
    const imported: ProfileBlock[] = [
      { id: "c1", kind: "link", label: "a", value: "https://a.be" },
      { id: "x", kind: "link", label: "b", value: "https://b.be" },
      { id: "y", kind: "link", label: "c", value: "https://c.be" },
    ];
    const { blocks, dropped } = mergeImportedBlocks(current, imported, "append");
    expect(blocks).toHaveLength(IMPORT_MAX_BLOCKS);
    expect(dropped).toBe(1);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(IMPORT_MAX_BLOCKS);
  });
});
