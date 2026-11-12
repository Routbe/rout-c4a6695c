import { describe, expect, it } from "vitest";
import { assertVerifiedOwner, fediverseHeadLinks, hasReciprocalLink, mastodonProfileSchema } from "@/lib/fediverse-profile";
describe("Mastodon ownership", () => {
  it("accepts the requested full handle and profile URL forms", () => {
    expect(mastodonProfileSchema.parse("@user@instance.domain")).toBe("https://instance.domain/@user");
    expect(mastodonProfileSchema.parse("https://mastodon-belgium.be/@Maximiliem")).toBe("https://mastodon-belgium.be/@Maximiliem");
  });
  it("refuses credentials, HTTP, fragments and non-profile URLs", () => {
    for (const input of ["http://instance.domain/@user", "https://user:password@instance.domain/@user", "https://instance.domain/@user#x", "https://instance.domain/api/users", "https://localhost/@user"]) expect(mastodonProfileSchema.safeParse(input).success).toBe(false);
  });
  it("requires a real rel=me backlink to the exact path profile", () => {
    expect(hasReciprocalLink('<a rel="noopener me" href="https://rout.be/@gebruiker">ROUT</a>', ["https://rout.be/@gebruiker"], "https://instance.domain/@user")).toBe(true);
    expect(hasReciprocalLink('<a rel="me" href="https://rout.be/@ander">ROUT</a>', ["https://rout.be/@gebruiker"], "https://instance.domain/@user")).toBe(false);
  });
  it("accepts the same member's active subdomain or custom domain", () => {
    for (const url of ["https://gebruiker.rout.be/", "https://profile.example.org/"]) expect(hasReciprocalLink(`<a rel="me" href="${url}">ROUT</a>`, ["https://gebruiker.rout.be", "https://profile.example.org"], "https://instance.domain/@user")).toBe(true);
  });
  it("rejects lookalike hosts, text, comments and script markup", () => {
    for (const html of ['<a rel="me" href="https://gebruiker.rout.be.evil.org">x</a>', '<!-- <a rel="me" href="https://gebruiker.rout.be">x</a> -->', '<script>"<a rel=me href=https://gebruiker.rout.be>x</a>"</script>', '<a href="https://gebruiker.rout.be">x</a>']) expect(hasReciprocalLink(html, ["https://gebruiker.rout.be"], "https://instance.domain/@user")).toBe(false);
  });
  it("requires a verified email on the owning account", () => {
    expect(() => assertVerifiedOwner(null, "owner")).toThrowError(expect.objectContaining({ statusCode: 401 }));
    expect(() => assertVerifiedOwner({ id: "other", emailConfirmedAt: "2026-11-01" }, "owner")).toThrowError(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertVerifiedOwner({ id: "owner", emailConfirmedAt: null }, "owner")).toThrowError(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertVerifiedOwner({ id: "owner", emailConfirmedAt: "2026-11-01" }, "owner")).not.toThrow();
  });
});