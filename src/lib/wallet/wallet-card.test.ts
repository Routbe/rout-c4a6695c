import { describe, expect, it } from "vitest";
import { harmonizeProfileBackground } from "./wallet-color";
import {
  appleCardPassJson,
  googleCardClass,
  googleCardObject,
  sovereignIdFromDigest,
  walletCardPayload,
  walletForeground,
  WALLET_DEFAULT_SUBHEADER,
} from "./wallet-pass";

const base = "https://rout.be";
const root = walletCardPayload({ handle: "Jona", space: "root", displayName: "Jona Zeno", tagline: null, themeBg: "#0d0d0d", avatarSrc: "/api/public/avatar?path=x/y.webp" }, base, "ROUT-ABCD-1234");
const alias = walletCardPayload({ handle: "studio", space: "alias", displayName: null, tagline: "Maker  van dingen", themeBg: "#f7f4ef", avatarSrc: "https://evil.example/a.png" }, base, "ROUT-0000-0000");

describe("ROUT Card wallet payload", () => {
  it("QR points at the real public profile: root at /@<handle>, alias at /u/<handle>", () => {
    expect(root.qrValue).toBe("https://rout.be/@jona");
    expect(alias.qrValue).toBe("https://rout.be/u/studio");
  });

  it("uses the bio as subheader, falling back to 'Sovereign Profile Hub'", () => {
    expect(root.subheader).toBe(WALLET_DEFAULT_SUBHEADER);
    expect(alias.subheader).toBe("Maker van dingen");
  });

  it("only uses ROUT's own image routes for the hero image", () => {
    expect(root.heroImageUrl).toBe("https://rout.be/api/public/avatar?path=x/y.webp");
    expect(alias.heroImageUrl).toBeNull();
  });

  it("Google loyalty object carries the handle, card number and a QR_CODE barcode", () => {
    const o = googleCardObject(root, "3388000000000000000");
    const tile = harmonizeProfileBackground(root.hexBackgroundColor, root.accentHex).toLowerCase();
    expect(o.classId).toBe(`3388000000000000000.rout_card_${tile.slice(1)}`);
    expect(o.accountName).toBe("@jona");
    expect(o.accountId).toBe("ROUT-ABCD-1234");
    expect(o.barcode).toMatchObject({ type: "QR_CODE", value: "https://rout.be/@jona" });
    expect(o.heroImage?.sourceUri.uri).toMatch(/^https:\/\/rout\.be\/api\/wallet\/render\/jona\/[a-z0-9]+\/hero\.png$/);
    expect(o.imageModulesData).toBeUndefined();
    // Google rejects these on a loyalty object: colour and logo belong to the class.
    expect("hexBackgroundColor" in o).toBe(false);
    expect("logo" in o).toBe(false);
  });

  it("Google loyalty class per tile colour carries the colour and the ROUT logo", () => {
    const k = googleCardClass(root, "3388");
    // Neutral canvas is tinted with the accent: the closed pass is never flat grey.
    expect(k.hexBackgroundColor).toBe(harmonizeProfileBackground(root.hexBackgroundColor, root.accentHex).toLowerCase());
    expect(k.id).toBe(`3388.rout_card_${k.hexBackgroundColor.slice(1)}`);
    expect(k.programLogo.sourceUri.uri).toBe("https://rout.be/api/wallet/render/logo/131211/rout.png");
    const purple = walletCardPayload({ handle: "p", space: "root", displayName: null, tagline: null, themeBg: "#7026e1", accent: "#7026e1", avatarSrc: null }, base, "RT");
    expect(googleCardClass(purple, "3388").id).not.toBe(k.id);
    // Same colour, different member: one shared class.
    expect(googleCardClass({ ...root, handle: "someone" }, "3388").id).toBe(k.id);
  });

  it("alias cards show the @u/ address as their primary line", () => {
    expect(googleCardObject(alias, "3388").accountName).toBe("@u/studio");
  });

  it("Apple pass shows the same QR and colours as Google", () => {
    const p = appleCardPassJson(root, { passTypeId: "pass.be.rout", teamId: "TEAM" });
    expect(p.barcodes[0]?.message).toBe(root.qrValue);
    expect(p.backgroundColor).toBe("rgb(33, 97, 68)");
    expect(p.foregroundColor).toBe("rgb(255, 255, 255)");
  });

  it("keeps a coloured profile canvas as the pass colour", () => {
    const c = walletCardPayload({ handle: "x", space: "root", displayName: null, tagline: null, themeBg: "#7026e1", avatarSrc: null }, base, "RT");
    expect(c.hexBackgroundColor).toBe("#7026e1");
  });

  it("picks readable text colours and hash-based card numbers", () => {
    expect(walletForeground("#f7f4ef")).toBe("#111111");
    expect(walletForeground("#0d0d0d")).toBe("#ffffff");
    expect(sovereignIdFromDigest("ab12cd34ef")).toMatch(/^RT-[0-9A-Y]{4}-[0-9A-Y]{4}-[0-9A-Y]$/);
  });
});

describe("Google Wallet save link signing", () => {
  it("produces an RS256 JWT Google can verify, carrying the ROUT Card object", async () => {
    const { generateKeyPair, exportPKCS8, jwtVerify } = await import("jose");
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const { googleCardSave } = await import("./google-wallet.server");
    const pem = await exportPKCS8(privateKey);
    const { jwt, saveUrl } = await googleCardSave(root, base, { issuerId: "3388", serviceAccountEmail: "sa@x.iam.gserviceaccount.com", privateKey: pem });
    expect(saveUrl).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, { audience: "google", issuer: "sa@x.iam.gserviceaccount.com" });
    expect(protectedHeader.alg).toBe("RS256");
    const obj = (payload as { payload: { loyaltyObjects: { barcode: { value: string } }[] } }).payload.loyaltyObjects[0];
    expect(obj?.barcode.value).toBe("https://rout.be/@jona");
  });
});
