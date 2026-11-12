import { describe, expect, it } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { setGoogleKeyPassState } from "./google-wallet-sync.server";

async function env() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return {
    GOOGLE_WALLET_ISSUER_ID: "3388000000000000000",
    GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "wallet@example.iam.gserviceaccount.com",
    GOOGLE_WALLET_PRIVATE_KEY: await exportPKCS8(privateKey),
  };
}

describe("Google Wallet key pass follows the card state", () => {
  it("switches the saved key pass to INACTIVE when the card is blocked, frozen or replaced", async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    const f = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return url.includes("oauth2") ? Response.json({ access_token: "t" }) : Response.json({});
    };
    await setGoogleKeyPassState(["key_abc"], "INACTIVE", await env(), 4000, f);
    const patch = calls.find((c) => c.url.includes("/loyaltyObject/"));
    expect(patch?.method).toBe("PATCH");
    expect(patch?.url).toContain(encodeURIComponent("3388000000000000000.key_abc"));
    expect(JSON.parse(patch!.body!)).toEqual({ state: "INACTIVE" });
  });

  it("does nothing without Google Wallet keys", async () => {
    let called = false;
    await setGoogleKeyPassState(["key_abc"], "INACTIVE", {}, 4000, async () => { called = true; return new Response(); });
    expect(called).toBe(false);
  });
});
