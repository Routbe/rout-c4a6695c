import { describe, expect, it } from "vitest";
import { renderAuthMail } from "./design/mails";
import { transactionalTags, buildPostmarkPayload } from "./send.server";
import { authPlainText } from "@/lib/email.server";

const LINK = "https://rout.be/api/auth/magic-link/verify?token=abc";

describe("auth mail deliverability", () => {
  const { html } = renderAuthMail("magic-link", "nl", { link: LINK, code: "123456", to: "jan@example.com" });

  it("has no external social icons, only the ROUT badge PNG linking to rout.be/rout.be", () => {
    expect(html).not.toMatch(/favicon\.im|instagram|linkedin|github/i);
    expect(html).toContain('href="https://rout.be/rout.be"');
    expect(html).toContain('src="https://rout.be/img/verified-on-rout.png"');
  });

  it("injects a Gmail ViewAction pointing at the magic link", () => {
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html);
    expect(JSON.parse(m![1]!).potentialAction).toEqual({ "@type": "ViewAction", url: LINK, name: "Inloggen bij ROUT" });
  });

  it("names the recipient in the disclaimer", () => {
    expect(html).toContain("verzonden naar jan@example.com wegens een inlogpoging");
  });

  it("tags login mails otp+auth and disables open/click tracking", () => {
    expect(transactionalTags("login")).toEqual(expect.arrayContaining(["transactional", "auth", "otp"]));
    const p = buildPostmarkPayload({ to: "jan@example.com", subject: "s", html, text: "t", category: "login", correlationId: "c" });
    expect(p["TrackOpens"]).toBe(false);
    expect(p["TrackLinks"]).toBe("None");
  });

  it("darkens natively for dark-mode readers", () => {
    expect(html).toContain("@media (prefers-color-scheme: dark)");
  });

  it("sends a plain-text part with code and link and no HTML", () => {
    const text = authPlainText("Inloggen", "123456", LINK, "jan@example.com");
    expect(text).toContain("123456");
    expect(text).toContain(LINK);
    expect(text).not.toMatch(/<[a-z]/i);
  });
});
