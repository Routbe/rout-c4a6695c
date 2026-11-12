import { describe, expect, it } from "vitest";
import { QR_PRESETS, buildPresetSuggestion, campaignSlug, normalizeQrSuggestion, qrDestinationSchema, withUtm } from "./qr-campaign-presets";

const event = QR_PRESETS.find((p) => p.id === "event")!;

describe("QR Smart Labels presets (no AI)", () => {
  it("rejects unsafe destinations", () => {
    expect(qrDestinationSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(qrDestinationSchema.safeParse("http://example.com").success).toBe(false);
  });
  it("bounds label and call to action", () => {
    expect(normalizeQrSuggestion({ label: "x".repeat(90), callToAction: "y".repeat(120) })).toEqual({ label: "x".repeat(60), callToAction: "y".repeat(80) });
  });
  it("adds UTM tags from the preset and campaign name", () => {
    const s = buildPresetSuggestion(event, { destination: "https://example.com/tickets", campaign: "Zomerfeest 2026", addUtm: true });
    const url = new URL(s.destination);
    expect(url.searchParams.get("utm_source")).toBe("event");
    expect(url.searchParams.get("utm_medium")).toBe("qr");
    expect(url.searchParams.get("utm_campaign")).toBe("zomerfeest-2026");
    expect(s.label).toBe("Zomerfeest 2026 – Schrijf je in");
    expect(s.callToAction).toBe("Scan en schrijf je in");
  });
  it("keeps the destination untouched without UTM and keeps existing UTM values", () => {
    expect(buildPresetSuggestion(event, { destination: "https://example.com/a", addUtm: false }).destination).toBe("https://example.com/a");
    expect(new URL(withUtm("https://example.com/?utm_source=mail", event.utm, "x")).searchParams.get("utm_source")).toBe("mail");
  });
  it("slugs campaign names", () => expect(campaignSlug("  Été Actie!! ")).toBe("ete-actie"));
});
