import { describe, expect, it } from "vitest";
import { bioContainsRoutLink, isBioVerifiable, isMemberRoutHost } from "@/lib/open-web-rules";

describe("bio link verification", () => {
  it("matches the exact link", () => {
    expect(bioContainsRoutLink("Find me at rout.be/anna", "anna")).toBe(true);
    expect(bioContainsRoutLink("https://rout.be/anna/", "anna")).toBe(true);
    expect(bioContainsRoutLink('<a href="https://www.rout.be/anna">x</a>', "anna")).toBe(true);
    expect(bioContainsRoutLink("me: rout.be/Anna.", "anna")).toBe(true);
  });
  it("rejects a longer username (substring attack)", () => {
    expect(bioContainsRoutLink("rout.be/annabel", "anna")).toBe(false);
    expect(bioContainsRoutLink("rout.be/anna.b", "anna")).toBe(false);
    expect(bioContainsRoutLink("rout.be/anna-x", "anna")).toBe(false);
  });
  it("rejects a look-alike domain", () => {
    expect(bioContainsRoutLink("evilrout.be/anna", "anna")).toBe(false);
    expect(bioContainsRoutLink("rout.bex/anna", "anna")).toBe(false);
  });
  it("treats regex characters in the username literally", () => {
    expect(bioContainsRoutLink("rout.be/aXb", "a.b")).toBe(false);
  });
  it("supports Chess.com", () => {
    expect(isBioVerifiable("chesscom")).toBe(true);
  });
  it.each(["anna.rout.be", "anna.u.rout.be", "anna.r.rout.be"])("accepts the exact member host %s", (host) => {
    expect(bioContainsRoutLink(`<a href="https://${host}/">ROUT</a>`, "anna")).toBe(true);
    expect(isMemberRoutHost(host, "anna")).toBe(true);
  });
  it("accepts the free profile path", () => {
    expect(bioContainsRoutLink("https://rout.be/u/anna", "anna")).toBe(true);
  });
  it.each(["other.anna.rout.be", "anna.rout.be.evil.com", "annabel.u.rout.be", "evilrout.be/anna", "https://evil.com/rout.be/anna", "https://rout.be@evil.com/anna"])("rejects lookalike proof %s", (link) => {
    expect(bioContainsRoutLink(link, "anna")).toBe(false);
    expect(isMemberRoutHost(link, "anna")).toBe(false);
  });
});
