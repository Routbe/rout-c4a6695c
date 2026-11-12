import { hexToOklch } from "./wallet-color";
import { describe, expect, it } from "vitest";
import { GOOGLE_PASS_DESIGN, googleArtworkVersion } from "./google-premium-art";
import { googleCardClass, googleCardObject, googleCardSaveClaims, walletCardPayload } from "./wallet-pass";

const card = walletCardPayload({ handle: "maker", space: "root", displayName: "Maker", tagline: "My work", themeBg: "#ff00ff", accent: "#ff0000", avatarSrc: null }, "https://rout.be", "RT-235Q-ABCD-X");
describe("premium Google pass rules", () => {
  it("harmonises saturated profile colours into a rich jewel-tone tile with readable white text", async () => {
    const { contrastRatio } = await import("./wallet-color");
    const bg = googleCardClass(card, "3388").hexBackgroundColor;
    const lch = hexToOklch(bg)!;
    expect(lch.L).toBeGreaterThanOrEqual(0.25);
    expect(lch.L).toBeLessThanOrEqual(0.445);
    expect(lch.C).toBeGreaterThanOrEqual(0.045);
    expect(lch.C).toBeLessThanOrEqual(0.145);
    expect(contrastRatio("#ffffff", bg)).toBeGreaterThanOrEqual(4.5);
    expect(card.hexBackgroundColor).toBe("#ff00ff");
  });
  it("puts the handle on the primary front row and name + card number on the second", () => {
    const rows = googleCardSaveClaims(card, { issuerId: "3388", serviceAccountEmail: "fixture@example.invalid", origins: ["https://rout.be"] }).payload.loyaltyClasses[0]?.classTemplateInfo?.cardTemplateOverride.cardRowTemplateInfos ?? [];
    const paths = rows.map((r) => ("oneItem" in r ? [r.oneItem.item] : [r.twoItems.startItem, r.twoItems.endItem]).map((i) => i.firstValue.fields[0]?.fieldPath));
    expect(paths).toEqual([["object.accountName"], ["object.textModulesData['name']", "object.accountId"]]);
  });
  it("keeps the long cryptographic texts off the card face, only in the details", () => {
    const object = googleCardObject(card, "3388");
    const ids = object.textModulesData.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["authentication", "sovereignty", "infrastructure", "emergency"]));
    const rows = JSON.stringify(googleCardClass(card, "3388").classTemplateInfo);
    for (const id of ["authentication", "sovereignty", "infrastructure", "emergency", "hub"]) expect(rows).not.toContain(`'${id}'`);
  });
  it("uses 660-square logo with 17.5 percent safe padding", () => {
    expect(GOOGLE_PASS_DESIGN.logoSize).toBe(660);
    expect(GOOGLE_PASS_DESIGN.logoPadding).toBe(0.175);
  });
  it("uses a 1032x812 hero and no strip image or profile photo", () => {
    expect([GOOGLE_PASS_DESIGN.heroWidth, GOOGLE_PASS_DESIGN.heroHeight]).toEqual([1032, 812]);
    const object = googleCardObject({ ...card, heroImageUrl: "https://rout.be/api/public/avatar?path=a/b.webp" }, "3388");
    expect(object.imageModulesData ?? []).toEqual([]);
    expect(object.heroImage?.sourceUri.uri).not.toContain("avatar");
  });
  it("shows the official ROUT badge as logo, identical for every member", () => {
    const a = googleCardClass(card, "3388").programLogo.sourceUri.uri;
    const b = googleCardClass({ ...card, handle: "other", hexBackgroundColor: "#123456" }, "3388").programLogo.sourceUri.uri;
    expect(a).toBe("https://rout.be/api/wallet/render/logo/131211/rout.png");
    expect(b).toBe(a);
  });
  it("versions clean public PNG URLs when card data changes", () => {
    const object = googleCardObject(card, "3388");
    const uri = new URL(object.heroImage!.sourceUri.uri);
    expect(uri.search).toBe("");
    expect(uri.pathname.endsWith("/hero.png")).toBe(true);
    expect(googleArtworkVersion({ ...card, displayName: "Changed" })).not.toBe(googleArtworkVersion(card));
  });
});
describe("Google pass follows the whole profile palette", () => {
  it("mixes canvas and accent in OKLab: same accent, different canvas → different tint", async () => {
    const { harmonizeProfileBackground, hexToOklch } = await import("./wallet-color");
    const blue = harmonizeProfileBackground("#1d4ed8", "#41db97");
    const red = harmonizeProfileBackground("#b91c1c", "#41db97");
    expect(blue).not.toBe(red);
    for (const hex of [blue, red]) {
      const lch = hexToOklch(hex)!;
      expect(lch.L).toBeLessThanOrEqual(0.445);
      expect(lch.C).toBeGreaterThanOrEqual(0.045);
    }
  });
  it("a neutral canvas picks up the accent hue instead of staying grey", async () => {
    const { harmonizeProfileBackground, hexToOklch } = await import("./wallet-color");
    const lch = hexToOklch(harmonizeProfileBackground("#0b0b0b", "#e11d48"))!;
    expect(lch.C).toBeGreaterThanOrEqual(0.045);
  });
  it("logo tone keeps readable contrast on the harmonised background", async () => {
    const { contrastRatio, LOGO_TONES, pickLogoTone } = await import("./wallet-color");
    const bg = googleCardClass(card, "3388").hexBackgroundColor;
    expect(contrastRatio(LOGO_TONES[pickLogoTone(bg)], bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("hero carries no text; only verified members get the check seal", async () => {
    const { googlePremiumArtworkSvg, walletMonogram } = await import("./google-premium-art");
    expect(walletMonogram("Daniel Delacroix", "dd")).toBe("DD");
    expect(walletMonogram("élodie", "x")).toBe("É");
    expect(walletMonogram("@", "maker")).toBe("M");
    const plain = googlePremiumArtworkSvg({ ...card, displayName: "Ada Lovelace" }, "hero");
    const verified = googlePremiumArtworkSvg({ ...card, displayName: "Ada Lovelace", verified: true }, "hero");
    expect(plain).not.toContain("<text");
    expect(verified.length).toBeGreaterThan(plain.length);
    expect(verified).toContain('stroke-linecap="round"');
    expect(plain).not.toContain('stroke-linecap="round"');
    const doc = new DOMParser().parseFromString(verified, "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  });
  it("artwork URL changes when the profile canvas or verification changes", () => {
    expect(googleArtworkVersion({ ...card, hexBackgroundColor: "#123456" })).not.toBe(googleArtworkVersion(card));
    expect(googleArtworkVersion({ ...card, verified: true })).not.toBe(googleArtworkVersion(card));
  });
});
describe("generated Wallet image headers", () => {
  it("open to any origin and cached for a year as immutable", async () => {
    const { WALLET_IMAGE_HEADERS } = await import("./wallet-image-headers");
    expect(WALLET_IMAGE_HEADERS["access-control-allow-origin"]).toBe("*");
    expect(WALLET_IMAGE_HEADERS["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});
