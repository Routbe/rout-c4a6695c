/**
 * Scan-safety engine: WCAG-style contrast between the QR foreground and its
 * background, plus a matrix-density warning for very long payloads.
 */

export type ScanVerdict = "excellent" | "good" | "risky" | "unscannable";

export interface ScanReport {
  /** Contrast ratio, 1–21. */
  ratio: number;
  verdict: ScanVerdict;
  /** True when the payload makes a dense, hard-to-print matrix. */
  dense: boolean;
  length: number;
  /** Smallest reliable print size in mm for the current density. */
  minPrintMm: number;
  /** Modules per side of the encoded matrix, when known. */
  moduleCount?: number;
}

const HEX = /^#?([a-f\d]{3}|[a-f\d]{6})$/i;

/** Parse #rgb / #rrggbb (and the literal "transparent") to sRGB channels. */
export function parseColor(input: string): [number, number, number] | null {
  const value = (input || "").trim();
  if (!value || value === "transparent") return [255, 255, 255];
  const m = HEX.exec(value);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(fg: string, bg: string): number {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 21;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Cameras need far more separation than text does. Empirically, a ratio below
 * ~3:1 is unreliable on phone cameras and below ~2:1 will simply not decode.
 */
export function analyzeScanability(
  fg: string,
  bg: string,
  payload: string,
  moduleCount?: number,
): ScanReport {
  try {
    const ratio = contrastRatio(fg, bg);
    const length = (payload || "").length;

    let verdict: ScanVerdict;
    if (ratio >= 7) verdict = "excellent";
    else if (ratio >= 4.5) verdict = "good";
    else if (ratio >= 2.5) verdict = "risky";
    else verdict = "unscannable";

    // Prefer the real matrix size when we have it: character count is a poor
    // proxy (numeric payloads pack far tighter than binary ones).
    const modules = moduleCount && moduleCount > 0 ? moduleCount : undefined;
    const dense = modules ? modules >= 57 : length > 300;
    // ~0.5 mm per module keeps modules above the resolution of a phone camera
    // at arm's length; rounded up to the nearest 5 mm, never below 20 mm.
    const minPrintMm = modules
      ? Math.max(20, Math.ceil((modules * 0.5) / 5) * 5)
      : length > 700
        ? 45
        : length > 300
          ? 30
          : 20;

    return { ratio, verdict, dense, length, minPrintMm, moduleCount: modules };
  } catch (error) {
    // A malformed colour or payload must never take the render thread down.
    console.error("[scanability] analysis failed, using safe defaults", error);
    return SAFE_REPORT;
  }
}

/** Neutral, non-alarming fallback used when analysis throws. */
export const SAFE_REPORT: ScanReport = {
  ratio: 21,
  verdict: "excellent",
  dense: false,
  length: 0,
  minPrintMm: 20,
};

/** A single actionable problem found before exporting. */
export interface ExportIssue {
  id: "contrast" | "density" | "print-size" | "inverted" | "quiet-zone" | "logo";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  recommendation: string;
}

export interface ExportRiskReport {
  risky: boolean;
  issues: ExportIssue[];
  report: ScanReport;
}

interface ExportRiskInput {
  fgColor: string;
  bgColor: string;
  payload: string;
  /** Physical print size in millimetres, when the user picked one. */
  printMm?: number;
  /** Modules per side of the encoded matrix (from the live encoder). */
  moduleCount?: number;
  /** Quiet zone around the code, expressed in modules. */
  quietZoneModules?: number;
  /** Fraction of the matrix area covered by a centre logo (0–1). */
  logoCoverage?: number;
}

/**
 * Pre-flight check run right before a download. Returns every concrete reason
 * the exported artefact may fail to scan, plus what to do about it.
 */
export function analyzeExportRisk({
  fgColor,
  bgColor,
  payload,
  printMm,
  moduleCount,
  quietZoneModules,
  logoCoverage,
}: ExportRiskInput): ExportRiskReport {
  try {
    const report = analyzeScanability(fgColor, bgColor, payload, moduleCount);
    const issues: ExportIssue[] = [];

    if (report.verdict === "unscannable" || report.verdict === "risky") {
      issues.push({
        id: "contrast",
        severity: report.verdict === "unscannable" ? "critical" : "warning",
        title: "Low contrast between the code and its background",
        detail: `Measured contrast is ${report.ratio.toFixed(1)}:1. Phone cameras need at least 4.5:1 to decode reliably.`,
        recommendation:
          "Darken the dots or lighten the background until the contrast reaches 4.5:1 or higher.",
      });
    }

    const fg = parseColor(fgColor);
    const bg = parseColor(bgColor);
    if (fg && bg) {
      const lf = relativeLuminanceOf(fg);
      const lb = relativeLuminanceOf(bg);
      // Inverted codes decode fine on every modern reader, so this is only worth
      // raising when the separation is already marginal — otherwise it is noise.
      if (lf > lb && report.ratio < 7) {
        issues.push({
          id: "inverted",
          severity: "warning",
          title: "Inverted code with limited contrast",
          detail:
            "Light dots on a dark background at this contrast can confuse older scanners, which look for dark finder patterns on a light field.",
          recommendation: "Swap the colours so the dots are the darker of the two.",
        });
      }
    }

    // Finder patterns need a clear quiet zone; the spec calls for 4 modules.
    if (quietZoneModules !== undefined && quietZoneModules < 4) {
      issues.push({
        id: "quiet-zone",
        severity: quietZoneModules < 2 ? "critical" : "warning",
        title: "Quiet zone is too small around the finder patterns",
        detail: `The margin is about ${quietZoneModules.toFixed(1)} modules wide. Scanners need 4 clear modules to lock onto the three corner squares.`,
        recommendation:
          "Increase the margin until there are at least 4 blank modules on every side.",
      });
    }

    // Error correction level H tolerates ~30% loss, but only away from the
    // finder patterns — 25% centre coverage is the honest safe ceiling.
    if (logoCoverage !== undefined && logoCoverage > 0.25) {
      issues.push({
        id: "logo",
        severity: logoCoverage > 0.35 ? "critical" : "warning",
        title: "Logo covers too much of the matrix",
        detail: `The logo hides roughly ${Math.round(logoCoverage * 100)}% of the code. Error correction recovers up to about 30%, and only outside the corner squares.`,
        recommendation: "Reduce the logo size to 25% of the code or less.",
      });
    }

    if (report.dense) {
      issues.push({
        id: "density",
        severity: (report.moduleCount ?? 0) >= 105 || report.length > 900 ? "critical" : "warning",
        title: "Very dense matrix",
        detail: report.moduleCount
          ? `This QR is ${report.moduleCount}×${report.moduleCount} modules, so each module prints very small.`
          : `This QR encodes ${report.length} characters, which packs a lot of tiny modules into the grid.`,
        recommendation:
          "Shorten the content or switch to a Dynamic short link so the code stays sparse.",
      });
    }

    if (printMm !== undefined && printMm > 0 && printMm < report.minPrintMm) {
      issues.push({
        id: "print-size",
        severity: "warning",
        title: "Print size is too small for this amount of data",
        detail: `You selected ${printMm} mm, but this density needs at least ${report.minPrintMm} mm to stay readable.`,
        recommendation: `Increase the print size to ${report.minPrintMm} mm or larger.`,
      });
    }

    return { risky: issues.length > 0, issues, report };
  } catch (error) {
    console.error("[scanability] export risk check failed, allowing export", error);
    return { risky: false, issues: [], report: SAFE_REPORT };
  }
}

function relativeLuminanceOf(rgb: [number, number, number]): number {
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Convenience predicate used by the export flow. */
export function isExportRisky(input: ExportRiskInput): boolean {
  return analyzeExportRisk(input).risky;
}

/* ── Style-aware optical tolerance engine ───────────────────────────────── */

/** How forgiving a camera is with a given vector style. */
export type OpticalClass = "rigid" | "discrete" | "continuous";

export interface OpticalProfile {
  class: OpticalClass;
  /** Minimum quiet zone, in modules, before we warn. */
  minQuietModules: number;
  /** Highest safe centre-logo coverage (0–1). */
  maxLogoCoverage: number;
  /** Multiplier applied to the final scannability score (<= 1). */
  scorePenalty: number;
  label: string;
}

const OPTICAL_PROFILES: Record<OpticalClass, Omit<OpticalProfile, "label">> = {
  // ISO/IEC 18004 baseline — hard edges decode at the spec limits.
  rigid: { class: "rigid", minQuietModules: 4, maxLogoCoverage: 0.3, scorePenalty: 1 },
  // Separated points can visually merge when ink spreads at small print sizes.
  discrete: { class: "discrete", minQuietModules: 4, maxLogoCoverage: 0.26, scorePenalty: 0.96 },
  // Thin connective strokes bloom under phone sensors and low light.
  continuous: { class: "continuous", minQuietModules: 5, maxLogoCoverage: 0.22, scorePenalty: 0.9 },
};

const STYLE_CLASS: Record<string, OpticalClass> = {
  square: "rigid",
  sharp: "rigid",
  rounded: "rigid",
  classy: "rigid",
  ballpoint: "discrete",
  dots: "discrete",
  chalk: "discrete",
  mesh: "continuous",
  calligraphy: "continuous",
};

const STYLE_LABEL: Record<string, string> = {
  mesh: "Organic mesh",
  calligraphy: "Calligraphy",
  ballpoint: "Ballpoint",
  chalk: "Chalk",
  dots: "Dots",
};

/** Optical tolerance profile for the active pattern style. */
export function opticalProfile(style: string | undefined): OpticalProfile {
  const cls = STYLE_CLASS[style ?? "square"] ?? "rigid";
  return { ...OPTICAL_PROFILES[cls], label: STYLE_LABEL[style ?? ""] ?? "Standard" };
}

export interface StyleWarning {
  id: "quiet-zone" | "logo" | "density" | "contrast";
  severity: "warning" | "critical";
  message: string;
}

/** One machine-actionable correction the UI can apply on the user's behalf. */
export interface ScanFix {
  id: "contrast" | "quiet-zone" | "logo" | "density";
  label: string;
  /** Expected score gain, in points, if this fix is applied. */
  gain: number;
}

export interface ScanQuality {
  /** 0–100 human-readable scannability score. */
  score: number;
  label: "Optimal" | "Good" | "Fair" | "Risky";
  profile: OpticalProfile;
  warnings: StyleWarning[];
  /** Per-factor health, 0–1, for transparent breakdowns. */
  factors: { contrast: number; quietZone: number; logo: number; density: number };
  /** The single worst factor — what to fix first. */
  bottleneck: "contrast" | "quiet-zone" | "logo" | "density" | null;
  /** Ranked, actionable corrections. Empty when nothing is worth changing. */
  fixes: ScanFix[];
}

interface QualityInput {
  report: ScanReport;
  style?: string;
  quietZoneModules?: number;
  logoCoverage?: number;
  errorCorrection?: "L" | "M" | "Q" | "H";
}

/**
 * Holistic, non-linear scannability model.
 *
 * A weighted sum is the wrong shape for this problem: it lets a perfect
 * contrast score paper over a missing quiet zone, and a code that fails on one
 * axis fails outright in the real world. So the factors are multiplied — every
 * factor gates the whole score — and any factor in critical territory caps the
 * total, no matter how good the rest looks.
 */
export function scanQuality({
  report,
  style,
  quietZoneModules,
  logoCoverage,
  errorCorrection = "H",
}: QualityInput): ScanQuality {
  const profile = opticalProfile(style);
  const warnings: StyleWarning[] = [];

  // ── Contrast. Saturates at 12:1; collapses steeply below the 4.5:1 floor
  // because camera decode failure is a cliff, not a slope.
  const contrast =
    report.ratio >= 12
      ? 1
      : report.ratio >= 4.5
        ? 0.85 + (0.15 * (report.ratio - 4.5)) / 7.5
        : Math.max(0, ((report.ratio - 1.6) / 2.9) ** 1.6) * 0.85;
  if (report.ratio < 4.5) {
    warnings.push({
      id: "contrast",
      severity: report.ratio < 2.5 ? "critical" : "warning",
      message: `Low contrast (${report.ratio.toFixed(1)}:1) — cameras need at least 4.5:1.`,
    });
  }

  // ── Quiet zone. Full marks at the profile's minimum; below it the finder
  // patterns start bleeding into the artwork, so the curve drops fast.
  let quietZone = 1;
  if (quietZoneModules !== undefined) {
    const ratio = quietZoneModules / profile.minQuietModules;
    quietZone = ratio >= 1 ? 1 : Math.max(0, ratio ** 1.5) * 0.9 + 0.05;
    if (ratio < 1) {
      warnings.push({
        id: "quiet-zone",
        severity: ratio < 0.5 ? "critical" : "warning",
        message:
          profile.class === "continuous"
            ? `Warning: ${profile.label} lines require at least ${profile.minQuietModules} modules of quiet zone for reliable mobile camera reading.`
            : `Quiet zone is ${quietZoneModules.toFixed(1)} modules — ${profile.minQuietModules} keeps finders isolated.`,
      });
    }
  }

  // ── Logo coverage. Harmless up to half the safe ceiling, then increasingly
  // expensive as error correction gets eaten.
  let logo = 1;
  if (logoCoverage !== undefined && logoCoverage > 0) {
    const ratio = logoCoverage / profile.maxLogoCoverage;
    logo = ratio <= 0.5 ? 1 : Math.max(0, 1 - ((ratio - 0.5) / 0.5) ** 1.4 * 0.9);
    if (ratio > 1) {
      warnings.push({
        id: "logo",
        severity: ratio > 1.4 ? "critical" : "warning",
        message: `Logo covers ${Math.round(logoCoverage * 100)}% — ${profile.label} stays safe up to ${Math.round(profile.maxLogoCoverage * 100)}%.`,
      });
    }
  }

  // ── Density. Fine modules bloom under ink and camera blur; continuous
  // styles suffer most because their strokes already touch.
  const density = report.dense ? (profile.class === "continuous" ? 0.62 : 0.8) : 1;
  if (report.dense && profile.class !== "rigid") {
    warnings.push({
      id: "density",
      severity: "warning",
      message: `${profile.label} on a ${report.moduleCount ?? "?"}-module grid prints very fine — increase the size to ${report.minPrintMm} mm or more.`,
    });
  }

  // Level H buys back real-world tolerance for stylised fills.
  const eccBonus = errorCorrection === "H" ? 1 : errorCorrection === "Q" ? 0.97 : 0.92;

  const factors = { contrast, quietZone, logo, density };

  // Multiplicative composite: every axis gates the result.
  let score = contrast * quietZone * logo * density * profile.scorePenalty * eccBonus * 100;

  // Hard caps. One critical failure means the code is not dependable, and the
  // headline number must say so even when everything else is perfect.
  const criticals = warnings.filter((w) => w.severity === "critical");
  if (criticals.length > 0) score = Math.min(score, 38);
  if (report.verdict === "unscannable") score = Math.min(score, 14);
  if (warnings.length > 0) score = Math.min(score, 88);

  const rounded = Math.round(Math.max(0, Math.min(100, score)));

  // The worst axis is what the user should fix first.
  const entries: Array<[ScanFix["id"], number]> = [
    ["contrast", contrast],
    ["quiet-zone", quietZone],
    ["logo", logo],
    ["density", density],
  ];
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const bottleneck = worst[1] < 0.99 ? worst[0] : null;

  // Ranked fixes: the score each one would recover if it were made perfect.
  const fixes: ScanFix[] = entries
    .filter(([, v]) => v < 0.985)
    .map(([id, v]) => ({
      id,
      label: FIX_LABEL[id],
      gain: Math.max(1, Math.round(rounded / Math.max(v, 0.05) - rounded)),
    }))
    .sort((a, b) => b.gain - a.gain);

  const label: ScanQuality["label"] =
    rounded >= 90 ? "Optimal" : rounded >= 75 ? "Good" : rounded >= 55 ? "Fair" : "Risky";

  return { score: rounded, label, profile, warnings, factors, bottleneck, fixes };
}

const FIX_LABEL: Record<ScanFix["id"], string> = {
  contrast: "Raise contrast to 4.5:1",
  "quiet-zone": "Widen the quiet zone",
  logo: "Shrink the centre logo",
  density: "Shorten the content",
};
