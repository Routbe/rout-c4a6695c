import { describe, expect, it } from "vitest";
import { shareTargetUrl } from "@/components/dashboard/ShareCardWidgets";

describe("Command Center share widget", () => {
  it("shares the main page at the username", () => expect(shareTargetUrl("https://rout.be", "marijke", "hub")).toBe("https://rout.be/marijke"));
  it("shares the anonymous question page", () => expect(shareTargetUrl("https://rout.be/", "marijke", "ask")).toBe("https://rout.be/marijke/ask"));
  it("shares donation and booking pages", () => {
    expect(shareTargetUrl("https://rout.be", "marijke", "donate")).toBe("https://rout.be/marijke/donate");
    expect(shareTargetUrl("https://rout.be", "marijke", "booking")).toBe("https://rout.be/marijke/booking");
  });
});
