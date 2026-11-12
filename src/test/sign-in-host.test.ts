import { describe, expect, it } from "vitest";
import { chooseAuthBaseUrl } from "@/lib/auth-origin";

describe("sign-in stays on the host the visitor is on", () => {
  it("uses www.rout.be when the visitor is there, even if the configured origin is the apex", () => {
    expect(chooseAuthBaseUrl("https://www.rout.be", true, "https://rout.be", "https://rout.be")).toBe("https://www.rout.be");
  });
  it("falls back to the configured origin for unapproved deploy hosts", () => {
    expect(chooseAuthBaseUrl("https://rout-abc.vercel.app", false, "https://rout.be", "https://x.be")).toBe("https://rout.be");
  });
  it("falls back to the canonical origin when nothing is configured", () => {
    expect(chooseAuthBaseUrl(null, false, null, "https://rout.be")).toBe("https://rout.be");
  });
});
