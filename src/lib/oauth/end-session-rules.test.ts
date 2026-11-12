import { describe, expect, it } from "vitest";
import { decideEndSessionRedirect } from "./end-session-rules";

const base = { state: "s1", clientId: null, registered: ["https://app.example.com/bye"] };

describe("RP-initiated logout redirect", () => {
  it("redirects to a registered URI with a valid hint and echoes state", () => {
    const d = decideEndSessionRedirect({ ...base, requested: "https://app.example.com/bye", hintAud: "c1" });
    expect(d).toEqual({ kind: "redirect", target: "https://app.example.com/bye?state=s1" });
  });
  it("refuses an unregistered URI", () => {
    expect(decideEndSessionRedirect({ ...base, requested: "https://evil.example/bye", hintAud: "c1" }).kind).toBe("local");
  });
  it("refuses a redirect without id_token_hint", () => {
    expect(decideEndSessionRedirect({ ...base, requested: "https://app.example.com/bye", hintAud: null }).kind).toBe("local");
  });
  it("refuses when client_id differs from the hint audience", () => {
    expect(decideEndSessionRedirect({ ...base, clientId: "c2", requested: "https://app.example.com/bye", hintAud: "c1" }).kind).toBe("local");
  });
});

import { isTrustedLogoutRequest } from "./end-session-rules";

describe("isTrustedLogoutRequest", () => {
  const base = { origin: null, selfHost: "rout.be" };
  it("trusts same-origin and typed navigations", () => {
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: "same-origin" })).toBe(true);
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: "none" })).toBe(true);
  });
  it("refuses cross-site and same-site-subdomain requests", () => {
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: "cross-site" })).toBe(false);
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: "same-site" })).toBe(false);
  });
  it("falls back to Origin only; without it the user must confirm", () => {
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: null, origin: "https://rout.be" })).toBe(true);
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: null, origin: "https://evil.example" })).toBe(false);
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: null, origin: "null" })).toBe(false);
    expect(isTrustedLogoutRequest({ ...base, secFetchSite: null })).toBe(false);
  });
});
