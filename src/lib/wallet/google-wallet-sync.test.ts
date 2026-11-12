import { describe, expect, it } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { syncGoogleCard } from "./google-wallet-sync.server";
import { walletCardPayload } from "./wallet-pass";

const card = walletCardPayload({ handle: "member", space: "root", displayName: "Member", tagline: null, themeBg: "#1d4ed8", avatarSrc: null }, "https://rout.be", "RT-ABCD-1234-X");

async function cfg() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return { issuerId: "3388", serviceAccountEmail: "sa@x.iam.gserviceaccount.com", privateKey: await exportPKCS8(privateKey) };
}

function fakeGoogle(objectStatus: number, classStatus = 200) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url, body: init?.body as string | undefined });
    if (url.includes("oauth2")) return Response.json({ access_token: "tok" });
    if (url.includes("/loyaltyClass")) return new Response("{}", { status: init?.method === "POST" ? 200 : classStatus });
    return new Response("{}", { status: objectStatus });
  };
  return { f, calls };
}

describe("updating passes already saved in Google Wallet", () => {
  it("replaces the saved object with the current design (new hero URL, ROUT logo)", async () => {
    const { f, calls } = fakeGoogle(200);
    const r = await syncGoogleCard(card, "https://rout.be", await cfg(), f);
    expect(r).toEqual({ object: "updated", klass: "updated" });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("/loyaltyObject/3388.");
    const body = JSON.parse(put.body!);
    expect(body.heroImage.sourceUri.uri).toMatch(/\/hero\.png$/);
    expect(body.accountName).toBe("@member");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/loyaltyClass/3388.rout_card_");
    expect(JSON.parse(patch.body!).programLogo.sourceUri.uri).toBe("https://rout.be/api/wallet/render/logo/131211/rout.png");
  });
  it("reports 'new' when the member never saved the card (the save link creates it)", async () => {
    const { f } = fakeGoogle(404);
    expect((await syncGoogleCard(card, "https://rout.be", await cfg(), f)).object).toBe("new");
  });
  it("creates the class when it does not exist yet", async () => {
    const { f, calls } = fakeGoogle(404, 404);
    expect((await syncGoogleCard(card, "https://rout.be", await cfg(), f)).klass).toBe("created");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/loyaltyClass"))).toBe(true);
  });
  it("never throws when Google refuses the key", async () => {
    const f = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
    const r = await syncGoogleCard(card, "https://rout.be", await cfg(), f);
    expect(r.object).toBe("failed");
    expect(r.error).toContain("invalid_grant");
  });
});
