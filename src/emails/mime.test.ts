import { describe, expect, it } from "vitest";
import { buildHeaders, buildMimeMessage, dotStuff, newMessageId } from "./mime";
import { AUTH_SENDER, SYSTEM_SENDER, senderFor, REPLY_TO } from "./send.server";

const base = {
  from: { name: "ROUT Authentication", email: "auth@rout.be" },
  to: "jan@example.com",
  replyTo: REPLY_TO,
  subject: "Je inlogcode",
  html: '<a href="https://rout.be/auth?code=1">Inloggen</a>',
  text: "https://rout.be/auth?code=1",
  messageId: "<abc@rout.be>",
  entityRefId: "mail_1",
};

describe("Infomaniak MIME message", () => {
  it("never carries list or campaign headers, even when asked", () => {
    const names = buildHeaders({
      ...base,
      extraHeaders: { "List-Unsubscribe": "<mailto:x>", Precedence: "bulk", "X-Campaign": "1", "X-Mailin-Campaign": "1" },
    }).map(([n]) => n.toLowerCase());
    expect(names.some((n) => n.startsWith("list-") || n === "precedence" || n.startsWith("x-campaign") || n.startsWith("x-mailin"))).toBe(false);
  });
  it("has Message-ID, X-Entity-Ref-ID and Reply-To hallo@rout.be", () => {
    const h = Object.fromEntries(buildHeaders(base));
    expect(h["Message-ID"]).toBe("<abc@rout.be>");
    expect(h["X-Entity-Ref-ID"]).toBe("mail_1");
    expect(h["Reply-To"]).toContain("<hallo@rout.be>");
  });
  it("gives every mail a different @rout.be Message-ID", () => {
    const a = newMessageId();
    expect(a).toMatch(/^<[a-z0-9]+@rout\.be>$/);
    expect(newMessageId()).not.toBe(a);
  });
  it("keeps links untouched (no tracking rewrite)", () => {
    const msg = buildMimeMessage(base);
    const htmlPart = msg.split("text/html; charset=UTF-8")[1]!.split("\r\n\r\n")[1]!.split("--")[0]!.replace(/\r\n/g, "");
    expect(new TextDecoder().decode(Uint8Array.from(atob(htmlPart), (c) => c.charCodeAt(0)))).toBe(base.html);
  });
  it("blocks header injection", () => {
    const h = Object.fromEntries(buildHeaders({ ...base, subject: "x\r\nBcc: evil@x.be" }));
    expect(h["Subject"]).not.toMatch(/[\r\n]/);
  });
  it("dot-stuffs lines starting with a dot", () => {
    expect(dotStuff("a\r\n.b")).toBe("a\r\n..b");
  });
  it("uses auth@ for sign-in and system@ for parental consent", () => {
    expect(senderFor("login")).toBe(AUTH_SENDER);
    expect(senderFor("system")).toBe(SYSTEM_SENDER);
    expect(AUTH_SENDER).toBe("ROUT Authentication <auth@rout.be>");
    expect(SYSTEM_SENDER).toBe("ROUT System <system@rout.be>");
  });
});
