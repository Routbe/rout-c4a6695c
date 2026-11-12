import { describe, expect, it } from "vitest";
import { singleEmoji, normalizeBubblePosition, normalizeBubbleStyle, normalizePresenceIndicator, contrastText } from "./status-bubble";
import { filterDecor, POPULAR_LIMIT } from "./decor-filter";

describe("custom emoji", () => {
  it("accepts exactly one emoji", () => {
    expect(singleEmoji("🔥")).toBe("🔥");
    expect(singleEmoji("👍🏽")).toBe("👍🏽");
    expect(singleEmoji("🇧🇪")).toBe("🇧🇪");
  });
  it("rejects text, two emojis and empty", () => {
    expect(singleEmoji("a")).toBeNull();
    expect(singleEmoji("🔥🔥")).toBeNull();
    expect(singleEmoji("")).toBeNull();
    expect(singleEmoji("hi🔥")).toBeNull();
  });
});

describe("old profiles defaults", () => {
  it("top-right, Obsidian, plain colour dot", () => {
    expect(normalizeBubblePosition(undefined)).toBe("top-right");
    expect(normalizeBubbleStyle(null)).toBe("obsidian-flat");
    expect(normalizePresenceIndicator(undefined)).toBe("color");
  });
});

it("bubble text stays readable", () => {
  expect(contrastText("#000000")).toBe("#ffffff");
  expect(contrastText("#ffffff")).toBe("#111111");
});

const items = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, label: `Item ${i}`, category: i % 2 ? "gaming" : "minimal" }));
const popular = items.slice(0, 12).map((i) => i.id);

describe("Popular grid", () => {
  it("shows at most 8 items", () => {
    expect(filterDecor(items, { filter: "popular", q: "", favs: [], popular })).toHaveLength(POPULAR_LIMIT);
    expect(POPULAR_LIMIT).toBe(8);
  });
  it("favourites come first", () => {
    const r = filterDecor(items, { filter: "popular", q: "", favs: ["d19"], popular });
    expect(r[0]!.id).toBe("d19");
  });
  it("search covers all items whatever pill", () => {
    const r = filterDecor(items, { filter: "popular", q: "item 15", favs: [], popular });
    expect(r.map((x) => x.id)).toEqual(["d15"]);
  });
  it("category pill shows only its own items", () => {
    expect(filterDecor(items, { filter: "gaming", q: "", favs: [], popular }).every((d) => d.category === "gaming")).toBe(true);
  });
});
