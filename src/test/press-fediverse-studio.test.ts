import { describe, expect, it } from "vitest";
import { Mail, Phone, Globe } from "lucide-react";
import { getSocialPlatformIcon, isEmailLike } from "@/lib/social-icons";
import { buildVCard } from "@/lib/vcard";
import { bioContainsLink, stripBioLinks } from "@/lib/bio-rules";
import { decodePending, encodePending, safeEqual, generateCode } from "@/lib/fediverse-otp.server";
import { profileText } from "@/lib/profile-i18n";

describe("icoonkeuze", () => {
  it("e-mail krijgt altijd een envelop, ook op een Fediverse-domein", () => {
    expect(getSocialPlatformIcon("mailto:jan@mastodon.social")).toBe(Mail);
    expect(getSocialPlatformIcon("jan@bsky.social")).toBe(Mail);
    expect(isEmailLike("@jan@mastodon.social")).toBe(false);
  });
  it("telefoon en gewone sites", () => {
    expect(getSocialPlatformIcon("tel:+32470000000")).toBe(Phone);
    expect(getSocialPlatformIcon("https://delplanche.com")).toBe(Globe);
  });
});

describe("vCard", () => {
  it("bevat naam, e-mail, telefoon, URL en ingebedde foto", () => {
    const card = buildVCard({
      handle: "jan",
      displayName: "Jan Delplanche",
      email: "jan@rout.be",
      phone: "+32 470",
      profileUrl: "https://rout.be/jan",
      photoBase64: "AAAA",
    });
    expect(card).toContain("N:Delplanche;Jan;;;");
    expect(card).toContain("EMAIL;TYPE=INTERNET:jan@rout.be");
    expect(card).toContain("TEL;TYPE=CELL:+32 470");
    expect(card).toContain("URL:https://rout.be/jan");
    expect(card).toContain("PHOTO;ENCODING=b;TYPE=JPEG:AAAA");
  });
});

describe("bio zonder links", () => {
  it("herkent en filtert links", () => {
    expect(bioContainsLink("kijk op https://x.com/a")).toBe(true);
    expect(bioContainsLink("zie www.rout.be")).toBe(true);
    expect(bioContainsLink("Ontwerper uit Gent.")).toBe(false);
    expect(stripBioLinks("Hallo https://evil.io/x wereld")).toBe("Hallo wereld");
  });
});

describe("Fediverse e-mailcode", () => {
  it("codeert de aanmelding heen en terug en weigert open redirects", () => {
    const raw = encodePending({ provider: "bluesky", accountId: "did:plc:1", handle: "a.bsky.social", next: "//evil" });
    expect(decodePending(raw)?.next).toBe("/dashboard");
    expect(decodePending("x|y|z|/")).toBeNull();
  });
  it("code is 6 cijfers, vergelijking is exact", () => {
    expect(generateCode()).toMatch(/^\d{6}$/);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("profielteksten", () => {
  it("valt terug op Engels", () => {
    expect(profileText("de", "saveContact")).toBe("Kontakt speichern");
    expect(profileText("es", "saveContact")).toBe("Save contact");
    expect(profileText("nl-BE", "saveContact")).toBe("Contact opslaan");
  });
});
