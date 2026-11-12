import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "./brevo-sync-plan";
import { BREVO_KINDS, brevoTemplate, renderAuthMail } from "./design/mails";
import { EMAIL_LANGUAGES } from "./template-ids";
import { buildPostmarkPayload, transactionalTags } from "./send.server";

const UNSUB = /unsubscribe|\[UNSUBSCRIBE\]|\{\{\s*unsubscribe|mirror|afmelden/i;

describe("transactional marking", () => {
  it("tags every mail transactional, auth mails also security", () => {
    expect(transactionalTags("payment")).toEqual(["transactional"]);
    expect(transactionalTags("login", ["x"])).toEqual(["transactional", "security", "auth", "otp", "x"]);
  });
  it("always uses the transactional message stream", () => {
    expect(buildPostmarkPayload({ to: "a@b.be", subject: "s", html: "h", text: "t", correlationId: "c" })["MessageStream"]).toBe("outbound");
  });
});

describe("one design, no unsubscribe placeholders", () => {
  it("every kind renders in every language without leftover {tokens} or unsubscribe links", () => {
    for (const kind of BREVO_KINDS)
      for (const lang of EMAIL_LANGUAGES) {
        const m = brevoTemplate(kind, lang);
        expect(m.html).toContain("Sovereign Infrastructure");
        expect(m.html).not.toMatch(UNSUB);
        expect(m.html.replace(/\{\{[^}]*\}\}|\{%[^%]*%\}/g, "")).not.toMatch(/\{[a-z_]+\}/);
      }
  });
  it("auth mails rendered by the app have no unsubscribe link", () => {
    for (const lang of EMAIL_LANGUAGES)
      expect(renderAuthMail("magic-link", lang, { code: "123456", link: "https://rout.be/x" }).html).not.toMatch(UNSUB);
  });
  it("sync plan covers the shared auth block and every billing block", () => {
    const ids = buildSyncPlan().map((i) => i.id);
    for (const id of [93, 13, 20, 21, 22, 30, 42, 52, 62, 72, 82, 90]) expect(ids).toContain(id);
  });
});
