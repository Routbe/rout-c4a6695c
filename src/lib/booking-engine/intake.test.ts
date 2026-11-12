import { describe, expect, it } from "vitest";
import { intakeFields, validateIntake, splitSensitive, seatsLeft } from "./intake";
import { offeredSelection, validBookingStart } from "./selection";
import { parseBookingConfig, serializeBookingConfig } from "../booking";
import { computeDays } from "./bitmap";

describe("booking intake", () => {
  const fields = intakeFields.parse([
    { id: "complaint", label: "Klachten", type: "textarea", required: true, sensitive: true },
    { id: "diet", label: "Dieet", type: "select", options: ["Vegan", "Geen"] },
    { id: "consent", label: "Akkoord", type: "checkbox", required: true },
  ]);
  it("requires the configured intake answer", () => {
    expect(validateIntake(fields, { consent: true })).toEqual({ ok: false, fieldId: "complaint" });
  });
  it("requires explicit consent", () => {
    expect(validateIntake(fields, { complaint: "Pijn", consent: false })).toEqual({ ok: false, fieldId: "consent" });
  });
  it("rejects choices outside the configured options", () => {
    expect(validateIntake(fields, { complaint: "Pijn", diet: "Unknown", consent: true })).toEqual({ ok: false, fieldId: "diet" });
  });
  it("excludes unknown guest-supplied fields", () => {
    expect(validateIntake(fields, { complaint: " Pijn ", consent: true, user_id: "other" })).toEqual({ ok: true, answers: { complaint: "Pijn", consent: true } });
  });
  it("keeps sensitive complaints out of plain answers", () => {
    expect(splitSensitive(fields, { complaint: "Pijn", diet: "Vegan", consent: true })).toEqual({ plain: { diet: "Vegan", consent: true }, secret: { complaint: "Pijn" } });
  });
});
describe("capacity and exceptions", () => {
  it("keeps a three-chair session open until all three seats are taken", () => {
    expect([0, 1, 2, 3, 4].map((taken) => seatsLeft(3, taken))).toEqual([3, 2, 1, 0, 0]);
  });
  it("blocks the entire inclusive August 1–15 holiday", () => {
    const days = computeDays({
      rules: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 540, endMinute: 1020, timezone: "UTC" })),
      freeOverrides: [], busy: [{ startUtc: new Date("2026-08-01T00:00:00Z"), endUtc: new Date("2026-08-16T00:00:00Z") }],
      fromDay: new Date("2026-08-01T00:00:00Z"), days: 16,
    });
    expect(days.slice(0, 15).every((day) => day.bits === "0".repeat(96))).toBe(true);
    expect(days[15]?.bits).toContain("1");
  });
});
describe("widget booking context", () => {
  const start = "2026-11-02T09:00:00Z";
  it("preserves only a currently offered chosen slot", () => {
    expect(offeredSelection(start, [start])).toBe(start);
    expect(offeredSelection(start, [])).toBeNull();
  });
  it("accepts UTC context and refuses invalid dates and local offsets", () => {
    expect(validBookingStart(start)).toBe(start);
    expect(validBookingStart("2026-11-02T10:00:00+01:00")).toBeUndefined();
    expect(validBookingStart("not-a-date")).toBeUndefined();
  });
  it("retains the optional three-slot setting through saving", () => {
    const config = { ...parseBookingConfig(null), showSlots: true };
    expect(parseBookingConfig(serializeBookingConfig(config)).showSlots).toBe(true);
    expect(parseBookingConfig('{}').showSlots).toBe(false);
  });
});