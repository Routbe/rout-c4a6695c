import { describe, expect, it } from "vitest";
import { balancedTitle, parseShareCardKind, parseShareCardLang, shareCardMeta, shareCardSvg } from "./og-action-card";

describe("share cards for action links", () => {
  it("only accepts the four action kinds", () => {
    expect(parseShareCardKind("ask")).toBe("ask");
    expect(parseShareCardKind("booking")).toBe("booking");
    expect(parseShareCardKind("profile")).toBeNull();
    expect(parseShareCardKind(null)).toBeNull();
  });

  it("falls back to Dutch for unknown languages", () => {
    expect(parseShareCardLang("es")).toBe("nl");
    expect(parseShareCardLang("fr")).toBe("fr");
  });

  it("never leaves a single word on its own second line", () => {
    expect(balancedTitle("Stuur me een anoniem bericht!", 25)).toEqual(["Stuur me een", "anoniem bericht!"]);
    expect(balancedTitle("Boek een afspraak met mij", 25)).toEqual(["Boek een afspraak met mij"]);
  });

  it("the anonymous card carries the NGL-style invitation and tap button", () => {
    const svg = shareCardSvg({ kind: "ask", lang: "nl", handle: "anna", name: "Anna", avatarUrl: null, urlLabel: "rout.be/anna/ask" });
    expect(svg).toContain("anoniem bericht!");
    expect(svg).toContain("Tik om me anoniem te sturen");
    expect(svg).toContain("rout.be/anna/ask");
  });

  it("escapes handles so a name cannot inject markup", () => {
    const svg = shareCardSvg({ kind: "tip", lang: "nl", handle: "a<b", name: "<x>", avatarUrl: null, urlLabel: "rout.be/a" });
    expect(svg).not.toContain("<b");
    expect(svg).not.toContain("<x>");
  });

  it("announces a 1200×630 PNG on an absolute https address", () => {
    const meta = shareCardMeta("anna", "donate", "nl", "alias");
    const img = meta.find((m) => "property" in m && m.property === "og:image");
    expect(img?.content).toBe("https://rout.be/api/public/og/anna.png?card=donate&lang=nl&space=alias");
    expect(meta).toContainEqual({ property: "og:image:type", content: "image/png" });
    expect(meta).toContainEqual({ property: "og:image:width", content: "1200" });
  });
});
