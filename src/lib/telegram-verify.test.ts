import { describe, expect, it } from "vitest";
import { extractTelegramCode, normalizeTelegramPhone } from "./telegram-verify";

describe("telegram verify", () => {
  it("accepts a bare 6-digit code or /verify <code>", () => {
    expect(extractTelegramCode("123456")).toBe("123456");
    expect(extractTelegramCode("/verify 654321")).toBe("654321");
    expect(extractTelegramCode("/start 112233")).toBe("112233");
  });
  it("rejects other text", () => {
    expect(extractTelegramCode("12345")).toBeNull();
    expect(extractTelegramCode("hello 123456 there")).toBeNull();
  });
  it("normalizes phone numbers", () => {
    expect(normalizeTelegramPhone("32486353111")).toBe("+32486353111");
  });
});
