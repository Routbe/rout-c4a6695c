import { expect, it } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { googleCardSave } from "./google-wallet.server";
import { walletCardPayload } from "./wallet-pass";

it("independently verifies the edge RS256 Google Wallet Save claim", async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const cfg = { issuerId: "12345", classId: "12345.rout_card", serviceAccountEmail: "wallet@example.iam.gserviceaccount.com", privateKey: privateKey.replace(/\n/g, "\\n") };
  const card = walletCardPayload({ handle: "member", space: "root", displayName: "Member", tagline: null, themeBg: null, avatarSrc: null }, "https://rout.be", "RT-ABCD-1234-X");
  const result = await googleCardSave(card, "https://rout.be", cfg);
  const verified = await jwtVerify(result.jwt, keys.publicKey, { algorithms: ["RS256"], issuer: cfg.serviceAccountEmail, audience: "google" });
  expect(verified.protectedHeader.alg).toBe("RS256");
  expect(verified.payload.typ).toBe("savetowallet");
  expect(verified.payload.origins).toEqual(["https://rout.be"]);
  expect(verified.payload.payload).toMatchObject({ loyaltyObjects: [{ accountName: expect.stringMatching(/^@/) }] });
  const claims = verified.payload.payload as { loyaltyClasses: { id: string }[]; loyaltyObjects: { classId: string }[] };
  expect(claims.loyaltyObjects[0]!.classId).toBe(claims.loyaltyClasses[0]!.id);
  expect(claims.loyaltyClasses[0]!.id.startsWith(`${cfg.classId}_`)).toBe(true);
  expect(result.saveUrl).toBe(`https://pay.google.com/gp/v/save/${result.jwt}`);
});