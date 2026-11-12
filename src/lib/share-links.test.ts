import { describe, expect, it } from "vitest";
import { snapchatAttachUrl, whatsappTextUrl } from "./share-links";

describe("share links fill in the ask link", () => {
  it("Snapchat attaches the link", () => {
    const u = new URL(snapchatAttachUrl("https://rout.be/jona/ask"));
    expect(u.origin + u.pathname).toBe("https://www.snapchat.com/scan");
    expect(u.searchParams.get("attachmentUrl")).toBe("https://rout.be/jona/ask");
  });
  it("WhatsApp types the message with the link", () => {
    const u = new URL(whatsappTextUrl("Stuur me een anonieme vraag https://rout.be/jona/ask"));
    expect(u.origin).toBe("https://wa.me");
    expect(u.searchParams.get("text")).toBe("Stuur me een anonieme vraag https://rout.be/jona/ask");
  });
});
