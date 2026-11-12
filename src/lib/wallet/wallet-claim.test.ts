import { describe, expect, it } from "vitest";
import { canClaimWalletCard } from "./wallet-claim";
import { googleCardSaveClaims, googleWalletConfig, walletCardPayload } from "./wallet-pass";

describe("owner Google Wallet claims", () => {
  it("rejects missing owner and another member's handle", () => {
    expect(canClaimWalletCard(null, "jona", "root")).toBe(false);
    expect(canClaimWalletCard({ handle: "jona", space: "root" }, "other", "root")).toBe(false);
  });
  it("checks namespace and accepts the current owner's handle", () => {
    expect(canClaimWalletCard({ handle: "jona", space: "root" }, "@Jona", "root")).toBe(true);
    expect(canClaimWalletCard({ handle: "jona", space: "root" }, "jona", "alias")).toBe(false);
  });
  it("loads requested service-account variable names and the issuer-scoped class", () => {
    const cfg = googleWalletConfig({ GOOGLE_WALLET_ISSUER_ID: "3388", GOOGLE_WALLET_CLASS_ID: "3388.ROUT_SOVEREIGN_PASS_V1", GOOGLE_SERVICE_ACCOUNT_EMAIL: "wallet-generator@example.invalid", GOOGLE_PRIVATE_KEY: "test-fixture-not-a-key" });
    expect(cfg?.serviceAccountEmail).toBe("wallet-generator@example.invalid");
    expect(cfg?.classId).toBe("3388.ROUT_SOVEREIGN_PASS_V1");
    const card = walletCardPayload({ handle: "jona", space: "root", displayName: null, tagline: null, themeBg: null, avatarSrc: null }, "https://rout.be", "RT-89K4-99X2-P");
    expect(googleCardSaveClaims(card, { issuerId: "3388", serviceAccountEmail: "wallet-generator@example.invalid", origins: ["https://rout.be"], classId: cfg?.classId }).payload.loyaltyObjects[0]?.classId).toMatch(/^3388\.ROUT_SOVEREIGN_PASS_V1_[0-9a-f]{6}$/);
  });
  it("rejects a class configured for a different issuer", () => {
    expect(googleWalletConfig({ GOOGLE_WALLET_ISSUER_ID: "3388", GOOGLE_WALLET_CLASS_ID: "999.ROUT_SOVEREIGN_PASS_V1", GOOGLE_SERVICE_ACCOUNT_EMAIL: "wallet-generator@example.invalid", GOOGLE_PRIVATE_KEY: "test-fixture-not-a-key" })).toBeNull();
  });
});