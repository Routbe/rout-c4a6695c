import { describe, expect, it } from "vitest";
import { GIFT_MAIL_RULE, giftIssueSchema, resendTarget } from "./gift-issue-rules";

const typed = giftIssueSchema.parse({
  kind: "fixed",
  amountCents: 1000,
  recipientEmail: "someone-else@example.com",
  message: "Click this link",
  sendEmail: true,
});

describe("admin gift e-mails", () => {
  it("re-sends a gift only to its stored recipient with the stored message", () => {
    const out = resendTarget(
      { recipientEmail: "owner@example.com", recipientName: "Owner", message: "Gefeliciteerd" },
      typed,
    );
    expect(out.recipientEmail).toBe("owner@example.com");
    expect(out.message).toBe("Gefeliciteerd");
    expect(out.recipientUserId).toBeNull();
  });

  it("caps gift e-mails at 20 per administrator per hour", () => {
    expect(GIFT_MAIL_RULE).toEqual({ limit: 20, windowSec: 3600 });
  });
});
