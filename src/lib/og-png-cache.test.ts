import { describe, expect, it } from "vitest";
import { ogCacheKey, OG_PNG_CACHE_PREFIX } from "./og-png-cache.server";

describe("share-card cache key", () => {
  it("is the same for the same card", async () => {
    expect(await ogCacheKey("<svg>a</svg>")).toBe(await ogCacheKey("<svg>a</svg>"));
  });
  it("changes when the card changes (profile edit = new image)", async () => {
    expect(await ogCacheKey("<svg>a</svg>")).not.toBe(await ogCacheKey("<svg>b</svg>"));
  });
  it("stays inside the share-card folder of the internal bucket", async () => {
    expect(await ogCacheKey("x")).toMatch(new RegExp(`^${OG_PNG_CACHE_PREFIX}[0-9a-f]{64}\\.png$`));
  });
});
