import { describe, expect, it } from "vitest";
import { decodeJwtPayload, pickIdentityLabel } from "./identity-label";

describe("identity labels", () => {
  it("prefers email for Google", () => {
    expect(pickIdentityLabel("google", { email: "jan@gmail.com", name: "Jan" })).toBe("jan@gmail.com");
  });
  it("prefers the username for GitHub/GitLab", () => {
    expect(pickIdentityLabel("github", { login: "octocat", email: "o@x.be" })).toBe("@octocat");
    expect(pickIdentityLabel("gitlab", { username: "jan" })).toBe("@jan");
    expect(pickIdentityLabel("infomaniak", { preferred_username: "jan.p" })).toBe("jan.p");
    expect(pickIdentityLabel("infomaniak", { email: "j@ik.me" })).toBe("j@ik.me");
  });
  it("returns null without data", () => {
    expect(pickIdentityLabel("github", {})).toBeNull();
    expect(pickIdentityLabel("github", null)).toBeNull();
  });
  it("decodes an id_token payload", () => {
    const payload = btoa(JSON.stringify({ email: "jé@x.be" }).replace(/é/, "\\u00e9")).replace(/=+$/, "");
    expect(decodeJwtPayload(`h.${payload}.s`)?.["email"]).toBe("jé@x.be");
    expect(decodeJwtPayload("garbage")).toBeNull();
  });
});
