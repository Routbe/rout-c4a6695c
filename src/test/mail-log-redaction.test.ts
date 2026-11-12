import { describe, expect, it, vi } from "vitest";
import { describeErrorForLog } from "@/lib/security/safe-errors";

vi.mock("@/lib/brevo-key", () => ({ brevoKeyStatus: () => ({}), describeBrevoFailure: () => "" }));

describe("log redaction", () => {
  it("never logs contact-form names, e-mails or message text", async () => {
    const { summariseParams } = await import("@/emails/send.server");
    const out = summariseParams({
      NAME: "Jan Peeters",
      EMAIL: "jan.peeters@example.com",
      MESSAGE: "Mijn rekeningnummer is BE12 3456",
      LANG: "nl",
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("Jan");
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("rekeningnummer");
    expect(out["LANG"]).toBe("nl");
  });

  it("masks e-mail addresses in logged errors", () => {
    expect(JSON.stringify(describeErrorForLog(new Error("failed for jonas@rout.be")))).not.toContain("jonas@");
  });
  it("removes arbitrary provider messages and contact contents from error diagnostics", () => {
    const result = describeErrorForLog(new Error("Jan Peeters PRIVATE_CONTACT_TEXT token=private-value"));
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CONTACT_TEXT");
    expect(JSON.stringify(result)).not.toContain("private-value");
    expect(result.stack).toContain("at ");
  });
});
