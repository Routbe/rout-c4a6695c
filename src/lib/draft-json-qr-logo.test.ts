import { describe, it, expect } from "vitest";
import { draftJsonRecordSchema } from "./draft-json-schema";

const logo = "data:image/png;base64," + "A".repeat(60_000);

describe("draft JSON: QR logo in display prefs", () => {
  it("accepts an embedded QR logo larger than 20k characters", () => {
    expect(draftJsonRecordSchema.safeParse({ qrSettings: { fgColor: "#000000", logo } }).success).toBe(true);
  });
  it("still rejects ordinary text over 20k characters", () => {
    expect(draftJsonRecordSchema.safeParse({ note: "x".repeat(20_001) }).success).toBe(false);
  });
  it("rejects a data image over 200k characters", () => {
    const big = "data:image/png;base64," + "A".repeat(200_000);
    expect(draftJsonRecordSchema.safeParse({ qrSettings: { logo: big } }).success).toBe(false);
  });
});
