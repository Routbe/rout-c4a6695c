import { describe, expect, it } from "vitest";
import { classifySaveError, isCriticalSaveError } from "./save-errors";
import { draftJsonRecordSchema } from "./draft-json-schema";

describe("classifySaveError", () => {
  it("maps an expired session to 401", () => expect(classifySaveError(new Error("Unauthorized"))).toMatchObject({ code: "session_expired", status: 401 }));
  it("maps a revision conflict to 409", () => expect(classifySaveError("draft_conflict").code).toBe("conflict"));
  it("maps a database timeout to 504", () => expect(classifySaveError(new Error("canceling statement due to statement timeout")).status).toBe(504));
  it("maps validation failures to 422", () => expect(classifySaveError("validation: blocks.0 too big").status).toBe(422));
  it("only server failures are critical", () => {
    expect(isCriticalSaveError("db_unavailable")).toBe(true);
    expect(isCriticalSaveError("validation_failed")).toBe(false);
    expect(isCriticalSaveError("conflict")).toBe(false);
  });
});

describe("draft JSON schema (root cause of 'Niet opgeslagen')", () => {
  it("accepts nested display prefs such as qrSettings", () => {
    expect(draftJsonRecordSchema.safeParse({ qrSettings: { fg: "#000", logo: { size: 0.2 } }, list: [{ a: 1 }] }).success).toBe(true);
  });
  it("refuses drafts above 512 KB", () => {
    const big = Array.from({ length: 40 }, () => "x".repeat(15_000));
    expect(draftJsonRecordSchema.safeParse({ big }).success).toBe(false);
  });
});
