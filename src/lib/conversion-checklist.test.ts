import { describe, expect, it } from "vitest";
import { analyzePageConversion } from "./conversion-coach";
import type { ProfileBlock } from "./profile";

const link = (i: number) => ({ id: String(i), kind: "link", label: `L${i}`, url: "https://x.be" }) as unknown as ProfileBlock;

describe("analyzePageConversion", () => {
  it("an empty page scores 0", () => {
    expect(analyzePageConversion({ avatarUrl: null, bio: null, blocks: [] }).percent).toBe(0);
  });
  it("3 to 7 active links is optimal, 8 is not", () => {
    const ok = analyzePageConversion({ avatarUrl: null, bio: null, blocks: [1, 2, 3].map(link) });
    const tooMany = analyzePageConversion({ avatarUrl: null, bio: null, blocks: [1, 2, 3, 4, 5, 6, 7, 8].map(link) });
    expect(ok.checks.find((c) => c.id === "link_count")?.ok).toBe(true);
    expect(tooMany.checks.find((c) => c.id === "link_count")?.ok).toBe(false);
  });
  it("a complete page reaches 100%", () => {
    const blocks = [...[1, 2].map(link), { id: "c", kind: "contact_form", label: "Contact" } as unknown as ProfileBlock];
    expect(analyzePageConversion({ avatarUrl: "a", bio: "Ik maak websites voor kmo's", blocks, verified: true, extraPageActive: true }).percent).toBe(100);
  });
});
