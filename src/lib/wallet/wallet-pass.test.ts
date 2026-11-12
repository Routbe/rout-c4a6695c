import { describe, expect, it } from "vitest";
import { applePassJson, googleSaveClaims, walletSerial, walletStatus } from "./wallet-pass";

const event = { kind: "event" as const, id: "Summer Fest!", title: "Summer Fest", subtitle: "1 aug 2026", url: "https://rout.be/event/summer", startsAt: "2026-08-01T18:00:00Z", venue: "Gent" };

describe("wallet passes", () => {
  it("is off until every certificate value is present", () => {
    expect(walletStatus({})).toEqual({ apple: false, google: false });
    expect(walletStatus({ APPLE_WALLET_PASS_TYPE_ID: "pass.be.rout", APPLE_WALLET_TEAM_ID: "T" })).toEqual({ apple: false, google: false });
    expect(walletStatus({ GOOGLE_WALLET_ISSUER_ID: "1", GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "a@b", GOOGLE_WALLET_PRIVATE_KEY: "k" }).google).toBe(true);
  });
  it("serials are safe and never collide between profiles and events", () => {
    expect(walletSerial(event)).toBe("event-summer-fest-");
    expect(walletSerial({ kind: "profile", id: "summer" })).not.toBe(walletSerial({ kind: "event", id: "summer" }));
  });
  it("Apple event pass without proven booking is informational and has no barcode", () => {
    const p = applePassJson(event, { passTypeId: "pass.be.rout", teamId: "TEAM" });
    expect("barcodes" in p).toBe(false);
    expect(p.generic.primaryFields[0]!.label).toBe("INFORMATIEF");
    expect(p.relevantDate).toBe("2026-08-01T18:00:00Z");
    expect(p.passTypeIdentifier).toBe("pass.be.rout");
  });
  it("Apple event pass with a verified booking carries the QR access claim", () => {
    const p = applePassJson({ ...event, accessClaim: true }, { passTypeId: "pass.be.rout", teamId: "TEAM" });
    expect(p.barcodes?.[0]!.message).toBe("https://rout.be/event/summer");
    expect(p.generic.primaryFields[0]!.label).toBe("EVENEMENT");
  });
  it("Profile passes always keep their business-card barcode", () => {
    const p = applePassJson({ kind: "profile", id: "jona", title: "Jona", subtitle: "@jona", url: "https://rout.be/jona" }, { passTypeId: "pass.be.rout", teamId: "TEAM" });
    expect(p.barcodes?.[0]!.message).toBe("https://rout.be/jona");
  });
  it("Google pass is bound to the issuer and our own origin", () => {
    const c = googleSaveClaims({ ...event, accessClaim: true }, { issuerId: "338", serviceAccountEmail: "sa@x.iam", origins: ["https://rout.be"] });
    expect(c.payload.loyaltyObjects[0]!.id.startsWith("338.")).toBe(true);
    expect(c.payload.loyaltyObjects[0]!.barcode?.value).toBe("https://rout.be/event/summer");
    expect(c.payload.loyaltyClasses[0]!.id).toBe(c.payload.loyaltyObjects[0]!.classId);
    expect(c.origins).toEqual(["https://rout.be"]);
  });
  it("Google event pass without proven booking is informational and barcodeless", () => {
    const c = googleSaveClaims(event, { issuerId: "338", serviceAccountEmail: "sa@x.iam", origins: ["https://rout.be"] });
    const obj = c.payload.loyaltyObjects[0]!;
    expect("barcode" in obj).toBe(false);
    expect(c.payload.loyaltyClasses[0]!.localizedAccountNameLabel?.translatedValues.map((value) => value.language).sort()).toEqual(["de", "fr", "nl"]);
  });
});

import { appleWalletConfig, googleWalletConfig } from "./wallet-pass";

describe("wallet certificate names", () => {
  it("accepts the APPLE_PASS_* names", () => {
    const c = appleWalletConfig({ APPLE_PASS_TYPE_ID: "pass.be.rout", APPLE_TEAM_ID: "T", APPLE_PASS_CERTIFICATE: "c", APPLE_PASS_KEY: "k", APPLE_WWDR_CERTIFICATE: "w" });
    expect(c?.certPem).toBe("c");
    expect(c?.keyPem).toBe("k");
  });
  it("reads the Google service-account JSON", () => {
    const c = googleWalletConfig({ GOOGLE_WALLET_ISSUER_ID: "338", GOOGLE_WALLET_SERVICE_ACCOUNT: JSON.stringify({ client_email: "sa@x.iam", private_key: "KEY" }) });
    expect(c).toEqual({ issuerId: "338", serviceAccountEmail: "sa@x.iam", privateKey: "KEY" });
  });
  it("treats malformed service-account JSON as not configured", () => {
    expect(googleWalletConfig({ GOOGLE_WALLET_ISSUER_ID: "338", GOOGLE_WALLET_SERVICE_ACCOUNT: "{oops" })).toBeNull();
  });
});
