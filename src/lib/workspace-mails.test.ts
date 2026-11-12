import { describe, expect, it } from "vitest";
import { renderAuthMail } from "@/emails/design/mails";

describe("workspace mails", () => {
  it("owner invite carries the transfer link and workspace name", () => {
    const m = renderAuthMail("workspace-owner-invite", "nl", { link: "https://rout.be/workspace-transfer/abc", name: "Acme", to: "a@b.be" });
    expect(m.subject).toContain("Acme");
    expect(m.html).toContain("https://rout.be/workspace-transfer/abc");
  });
  it("unknown language falls back to English", () => {
    const m = renderAuthMail("workspace-member-onboarding", "xx", { name: "Acme" });
    expect(m.subject).toBe("Welcome to your workspace Acme // ROUT");
  });
});
