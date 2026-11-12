import { describe, expect, it } from "vitest";
import { AGENT_SCOPES, AGENT_TOKEN_TTL_MAX_S, agentTokenTtl } from "./agent-scopes";
import { humanActionRequired, paymentRequired } from "./responses";
import { signActionTicket, verifyActionTicket } from "./action-ticket";
import { matchProfilePath, wantsMachineProfile } from "./content-negotiation";
import { hostMatchesDomains, requestingHost } from "./badge-origin";
import { SUPPORTED_SCOPES } from "@/lib/oauth/scope-rules";
import { m2mScopes } from "@/lib/oauth/m2m-rules";

describe("ephemeral agent tokens", () => {
  it("caps any grant with an agent scope at one hour", () => {
    expect(AGENT_TOKEN_TTL_MAX_S).toBe(3600);
    expect(agentTokenTtl(86400, ["openid", "assets:write"])).toBe(3600);
  });
  it("leaves ordinary Login-with-ROUT grants alone", () => {
    expect(agentTokenTtl(7200, ["openid", "profile"])).toBe(7200);
  });
  it("agent scopes are issuable through OAuth", () => {
    for (const s of AGENT_SCOPES) expect(SUPPORTED_SCOPES).toContain(s);
  });
  it("machine (client_credentials) tokens can never carry agent scopes", () => {
    expect(m2mScopes("assets:write", ["assets:write", "reports:read"])).toBeNull();
    expect(m2mScopes(null, ["assets:write", "reports:read"])).toEqual(["reports:read"]);
  });
});

describe("structured agent answers", () => {
  it("human_action_required is HTTP 202 with an action_url", async () => {
    const res = humanActionRequired({ action: "publish_profile", reason: "r", actionUrl: "https://rout.be/act?t=x", expiresAt: "2026-01-01T00:00:00Z" });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "human_action_required", action_url: "https://rout.be/act?t=x" });
  });
  it("plan limits are HTTP 402 with upgrade_url and reason", async () => {
    const res = paymentRequired({ reason: "limit", upgradeUrl: "https://rout.be/act?t=y" });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ upgrade_url: "https://rout.be/act?t=y", reason: "limit" });
  });
});

describe("temporary action links", () => {
  const secret = "s".repeat(32);
  it("valid for 15 minutes, then expired", async () => {
    const { ticket } = await signActionTicket(secret, "/studio", 1000);
    expect(await verifyActionTicket(secret, ticket, 1000 + 899)).toEqual({ ok: true, target: "/studio" });
    expect(await verifyActionTicket(secret, ticket, 1000 + 900)).toEqual({ ok: false, reason: "expired" });
  });
  it("a tampered or foreign ticket is refused", async () => {
    const { ticket } = await signActionTicket(secret, "/studio", 1000);
    expect((await verifyActionTicket("x".repeat(32), ticket, 1001)).ok).toBe(false);
  });
  it("never signs an external destination", async () => {
    await expect(signActionTicket(secret, "https://evil.example", 1000)).rejects.toThrow();
  });
});

describe("headless profile hub", () => {
  it("JSON for Accept: application/json and user-triggered agents", () => {
    expect(wantsMachineProfile("application/json", null)).toBe(true);
    expect(wantsMachineProfile("text/html", "Mozilla/5.0 (compatible; ChatGPT-User/1.0)")).toBe(true);
  });
  it("browsers, search crawlers and the Fediverse keep their formats", () => {
    expect(wantsMachineProfile("text/html,application/xhtml+xml,application/json;q=0.8", "Mozilla/5.0")).toBe(false);
    expect(wantsMachineProfile("text/html", "Mozilla/5.0 (compatible; GPTBot/1.0)")).toBe(false);
    expect(wantsMachineProfile("application/activity+json", null)).toBe(false);
  });
  it("matches profile paths only", () => {
    expect(matchProfilePath("/jona")).toEqual({ space: "verified", handle: "jona" });
    expect(matchProfilePath("/u/@nachtuil")).toEqual({ space: "alias", handle: "nachtuil" });
    expect(matchProfilePath("/dashboard")).toBeNull();
    expect(matchProfilePath("/llms.txt")).toBeNull();
  });
});

describe("web badge origin", () => {
  it("accepts the registered domain and its subdomains only", () => {
    expect(hostMatchesDomains("www.example.be", ["example.be"])).toBe(true);
    expect(hostMatchesDomains("example.be.evil.com", ["example.be"])).toBe(false);
  });
  it("prefers Origin, falls back to Referer, ignores non-https", () => {
    expect(requestingHost("https://shop.example.be", "https://other.be/x")).toBe("shop.example.be");
    expect(requestingHost(null, "https://example.be/page")).toBe("example.be");
    expect(requestingHost("http://example.be", null)).toBeNull();
  });
});
