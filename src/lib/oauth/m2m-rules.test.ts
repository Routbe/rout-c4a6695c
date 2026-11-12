import { describe, expect, it } from "vitest";
import { M2M_TOKEN_TTL_SEC, m2mClaims, m2mScopes } from "./m2m-rules";

describe("client_credentials", () => {
  it("tokens are valid for exactly 15 minutes", () => {
    const c = m2mClaims({ issuer: "https://rout.be", clientId: "c1", scopes: ["api"], nowSec: 1000, jti: "j" });
    expect(M2M_TOKEN_TTL_SEC).toBe(900);
    expect(c.exp - c.iat).toBe(900);
    expect(c.sub).toBe("client:c1");
  });
  it("never grants user identity scopes", () => {
    expect(m2mScopes("openid", ["openid", "api"])).toBeNull();
    expect(m2mScopes(null, ["openid", "email", "api"])).toEqual(["api"]);
  });
  it("refuses scopes the client was not given", () => {
    expect(m2mScopes("admin", ["api"])).toBeNull();
    expect(m2mScopes("api", ["api"])).toEqual(["api"]);
  });
});

describe("handle reservation never reaches a machine token", () => {
  it("rejects identity:handle_reservation in client_credentials", () =>
    expect(m2mScopes("identity:handle_reservation", ["identity:handle_reservation", "api"])).toBeNull());
});
