import { describe, expect, it } from "vitest";
import { ogSvg } from "@/lib/og-card";
import { routRabbitMarkup } from "@/lib/profile-qr";
import { LOGO_INNER } from "@/lib/brand/logo";

const base = { handle: "demo", name: "Demo", tagline: "x", bg: "#0d0d0d", accent: "#41DB97", avatarUrl: null };

describe("og card", () => {
  it("shows the blue mark next to the name for a verified badge", () => {
    expect(ogSvg({ ...base, badge: "verified" })).toContain('stroke="#1d9bf0"');
  });
  it("shows no blue mark when no badge is chosen", () => {
    expect(ogSvg({ ...base, badge: null })).not.toContain("#1d9bf0");
  });
  it("uses the studio canvas colour as background", () => {
    expect(ogSvg({ ...base, bg: "#f7f4ef" })).toContain('<rect width="1200" height="630" fill="#f7f4ef"/>');
  });
  it("uses the official ROUT bunny on the card and in the QR centre", () => {
    const inner = LOGO_INNER.slice(0, 200);
    expect(ogSvg(base)).toContain(inner);
    expect(routRabbitMarkup("#000000")).toContain(inner);
  });
});
