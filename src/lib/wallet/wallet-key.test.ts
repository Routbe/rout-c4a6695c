import { describe, expect, it } from "vitest";
import { appleKeyPassJson, appleNfcConfig, googleKeySaveClaims, PASS_TYPE_RULES, passTypeSpace, smartTapConfig } from "./wallet-key";
import { totpAt, verifyWalletKeyQr, verifyWalletKeyToken, walletKeyPayload, walletKeyQrNonce } from "./wallet-key.server";

const SECRET = "x".repeat(40);

describe("three separate Wallet passes", () => {
  it("only the key transmits NFC, only the profile cards show a fixed QR, only the key rotates", () => {
    expect(PASS_TYPE_RULES.PUBLIC_PROFILE).toEqual({ qr: true, nfc: false, rotatingQr: false });
    expect(PASS_TYPE_RULES.STEALTH).toEqual({ qr: true, nfc: false, rotatingQr: false });
    expect(PASS_TYPE_RULES.SMART_TAP_KEY).toEqual({ qr: false, nfc: true, rotatingQr: true });
    expect([passTypeSpace("PUBLIC_PROFILE"), passTypeSpace("STEALTH"), passTypeSpace("SMART_TAP_KEY")]).toEqual(["root", "alias", null]);
  });

  it("the Google key has Smart Tap, no fixed barcode and no handle, name or profile link", async () => {
    const key = (await walletKeyPayload("user-1", SECRET, 1_700_000_000_000))!;
    const c = googleKeySaveClaims(key, { issuerId: "3388", serviceAccountEmail: "sa@x", origins: ["https://rout.be"], logoUrl: "https://rout.be/logo.png", smartTap: { redemptionIssuerId: "3388" } });
    const [klass, obj] = [c.payload.loyaltyClasses[0]!, c.payload.loyaltyObjects[0]!];
    expect(klass.enableSmartTap).toBe(true);
    expect(klass.redemptionIssuers).toEqual(["3388"]);
    expect(obj.smartTapRedemptionValue).toBe(key.token);
    expect("barcode" in obj).toBe(false);
    expect(JSON.stringify(obj)).not.toMatch(/rout\.be\/@|\/u\/|user-1/);
  });

  it("the Google key QR is rotated by Google every 60 s as an 8-digit code, never a web link", async () => {
    const key = (await walletKeyPayload("user-1", SECRET))!;
    const c = googleKeySaveClaims(key, { issuerId: "3388", serviceAccountEmail: "sa@x", origins: ["https://rout.be"], logoUrl: "https://rout.be/logo.png", smartTap: { redemptionIssuerId: "3388" } });
    const rb = c.payload.loyaltyObjects[0]!.rotatingBarcode!;
    expect(rb.valuePattern).toBe(`rout:wk:${key.totp!.keyId}:{totp_value_0}`);
    expect(rb.totpDetails.periodMillis).toBe("60000");
    expect(rb.totpDetails.parameters[0]!.valueLength).toBe(8);
    expect(rb.totpDetails.parameters[0]!.key).toMatch(/^[0-9a-f]{40}$/);
  });

  it("TOTP matches RFC 6238 (SHA-1, 8 digits)", async () => {
    // RFC 6238 test secret "12345678901234567890"; T = 59 s with a 30 s step is counter 1.
    expect(await totpAt("3132333435363738393031323334353637383930", 1, 8)).toBe("94287082");
  });

  it("a scanned key code is accepted in its minute and the next, then refused", async () => {
    const key = (await walletKeyPayload("user-1", SECRET))!;
    const now = 1_700_000_030_000;
    const step = Math.floor(now / 60_000);
    const code = await totpAt(key.totp!.secretHex, step);
    const qr = `rout:wk:${key.totp!.keyId}:${code}`;
    expect(await verifyWalletKeyQr(qr, SECRET, now)).toEqual({ ok: true, keyId: key.totp!.keyId, step });
    expect((await verifyWalletKeyQr(qr, SECRET, now + 60_000)).ok).toBe(true);
    expect((await verifyWalletKeyQr(qr, SECRET, now + 120_000)).ok).toBe(false);
    expect((await verifyWalletKeyQr(qr, "y".repeat(40), now)).ok).toBe(false);
    expect((await verifyWalletKeyQr(`https://rout.be/${code}`, SECRET, now)).ok).toBe(false);
    expect(await walletKeyQrNonce(key.totp!.keyId, step)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("the Apple key carries the VAS nfc dictionary and no barcodes", async () => {
    const key = (await walletKeyPayload("user-1", SECRET))!;
    const p = appleKeyPassJson(key, { passTypeId: "pass.be.rout", teamId: "T" }, { encryptionPublicKey: "k" });
    expect(p.nfc.message).toBe(key.token);
    expect(new TextEncoder().encode(p.nfc.message).length).toBeLessThanOrEqual(64);
    expect("barcodes" in p).toBe(false);
  });

  it("re-issuing gives a new token for the same key, and tokens verify only with the secret", async () => {
    const a = (await walletKeyPayload("user-1", SECRET, 1_000_000))!;
    const b = (await walletKeyPayload("user-1", SECRET, 2_000_000))!;
    expect(a.serial).toBe(b.serial);
    expect(a.token).not.toBe(b.token);
    expect((await verifyWalletKeyToken(a.token, SECRET)).ok).toBe(true);
    expect((await verifyWalletKeyToken(a.token, "y".repeat(40))).ok).toBe(false);
    expect((await verifyWalletKeyToken(a.token.slice(0, -1) + (a.token.endsWith("A") ? "B" : "A"), SECRET)).ok).toBe(false);
  });

  it("the key serial is unlinkable to the account id and missing secrets give no key", async () => {
    const k = (await walletKeyPayload("user-1", SECRET))!;
    expect(k.serial).not.toContain("user-1");
    expect(await walletKeyPayload("user-1", "short")).toBeNull();
    expect(await walletKeyPayload("user-1", undefined)).toBeNull();
  });

  it("Smart Tap and Apple NFC stay off until their approvals are configured", () => {
    expect(smartTapConfig({})).toBeNull();
    expect(smartTapConfig({ GOOGLE_WALLET_SMART_TAP_ISSUER_ID: "3388000000022" })).toEqual({ redemptionIssuerId: "3388000000022" });
    expect(appleNfcConfig({ APPLE_WALLET_NFC_PUBLIC_KEY: "short" })).toBeNull();
  });
});
