import { describe, expect, it } from "vitest";
import { buildPostmarkPayload, AUTH_SENDER, SYSTEM_SENDER } from "./send.server";

const base = { to: "a@example.com", subject: "Code", html: '<a href="https://rout.be/auth/verify?t=1">x</a>', text: "x", correlationId: "mail_1" };

describe("Postmark payload", () => {
  it("never tracks opens or links and uses the transactional stream", () => {
    const p = buildPostmarkPayload(base);
    expect(p["TrackOpens"]).toBe(false);
    expect(p["TrackLinks"]).toBe("None");
    expect(p["MessageStream"]).toBe("outbound");
    expect(p["HtmlBody"]).toContain('href="https://rout.be/auth/verify?t=1"');
  });
  it("never carries List-Unsubscribe or other list headers, even when asked", () => {
    const p = buildPostmarkPayload({ ...base, extraHeaders: { "List-Unsubscribe": "<mailto:x>", "List-Unsubscribe-Post": "One-Click", Precedence: "bulk" } });
    const names = (p["Headers"] as { Name: string }[]).map((h) => h.Name.toLowerCase());
    expect(names).toEqual(["x-entity-ref-id"]);
  });
  it("adds a per-message X-Entity-Ref-ID", () => {
    const p = buildPostmarkPayload(base);
    expect(p["Headers"]).toContainEqual({ Name: "X-Entity-Ref-ID", Value: "mail_1" });
  });
  it("sends sign-in mail from auth@rout.be and the rest from system@rout.be", () => {
    expect(buildPostmarkPayload({ ...base, category: "login" })["From"]).toBe(AUTH_SENDER);
    expect(buildPostmarkPayload({ ...base, category: "payment" })["From"]).toBe(SYSTEM_SENDER);
  });
});
