import { describe, expect, it } from "vitest";
import { textureLayer } from "./profile-display";

const theme = { bg: "#000000", border: "#333333", card: "#111111", accent: "#ff0000" };

describe("textureLayer", () => {
  it("returns a transparent grid overlay without the base colour", () => {
    const t = textureLayer("grid", theme)!.backgroundImage;
    expect(t).toContain("linear-gradient");
    expect(t).not.toContain("#000000");
  });
  it("returns null for full-background styles", () => {
    expect(textureLayer("plain" as never, theme)).toBeNull();
    expect(textureLayer("gradient", theme)).toBeNull();
    expect(textureLayer("stripes", theme)).toBeNull();
  });
});
