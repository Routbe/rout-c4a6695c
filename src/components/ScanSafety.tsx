import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ChevronDown,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { analyzeScanability, scanQuality, type ScanReport } from "@/lib/scanability";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { i18n as trI18n } from "@/lib/i18n";

export function useScanReport(
  fgColor: string,
  bgColor: string,
  payload: string,
  moduleCount?: number,
): ScanReport {
  return useMemo(
    () => analyzeScanability(fgColor, bgColor, payload, moduleCount),
    [fgColor, bgColor, payload, moduleCount],
  );
}

/** True when the code should not be exported without an explicit confirmation. */
export const isExportRisky = (r: ScanReport) =>
  r.verdict === "risky" || r.verdict === "unscannable";

const STYLES = {
  excellent: {
    bar: "bg-accent",
    text: "text-highlight-foreground",
    Icon: ShieldCheck,
  },
  good: {
    bar: "bg-accent",
    text: "text-highlight-foreground",
    Icon: ShieldCheck,
  },
  risky: { bar: "bg-warning", text: "text-foreground", Icon: ShieldAlert },
  unscannable: { bar: "bg-destructive", text: "text-destructive", Icon: ShieldX },
} as const;

/**
 * Camera Safety Bar — live WCAG contrast + data-density readout under the
 * preview, so users see scan problems before they print.
 */
export function ScanSafety({
  fgColor,
  bgColor,
  payload,
  moduleCount,
  quietZonePx,
  quietZoneModules,
  logoCoverage,
  errorCorrection = "H",
  patternStyle,
  onAutoFixContrast,
}: {
  fgColor: string;
  bgColor: string;
  payload: string;
  moduleCount?: number;
  /** Quiet-zone margin of the exported file, in pixels. */
  quietZonePx?: number;
  /** Quiet-zone margin expressed in modules (4 or more is safe). */
  quietZoneModules?: number;
  /** Fraction of the code area covered by the centre logo slot (0–1). */
  logoCoverage?: number;
  /** Active QR error-correction level. */
  errorCorrection?: "L" | "M" | "Q" | "H";
  /** Active pattern style — drives the optical tolerance profile. */
  patternStyle?: string;
  /** Applies a safe high-contrast palette in one tap. */
  onAutoFixContrast?: () => void;
}) {
  const { t } = useI18n();
  const report = useScanReport(fgColor, bgColor, payload, moduleCount);
  const [open, setOpen] = useState(false);
  const quality = useMemo(
    () =>
      scanQuality({
        report,
        style: patternStyle,
        quietZoneModules,
        logoCoverage,
        errorCorrection,
      }),
    [report, patternStyle, quietZoneModules, logoCoverage, errorCorrection],
  );

  if (!payload) return null;

  const s = STYLES[report.verdict];
  const label =
    report.verdict === "unscannable"
      ? t("scan.unscannable")
      : report.verdict === "risky"
        ? t("scan.risky")
        : t("scan.safe");

  const minQuiet = quality.profile.minQuietModules;
  const quietOk = quietZoneModules === undefined ? true : quietZoneModules >= minQuiet;
  const coveragePct = logoCoverage ? logoCoverage * 100 : 0;
  const maxCoveragePct = Math.round(quality.profile.maxLogoCoverage * 100);
  const coverageOk = coveragePct <= maxCoveragePct;

  return (
    <div
      data-testid="scan-safety"
      className="w-full overflow-hidden rounded-2xl border border-border bg-card"
    >
      {/* Compact status bar — icon, label, explicit quality %, inline bar. */}
      <button
        type="button"
        data-testid="scan-safety-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="scan-safety-details"
        className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="flex min-h-6 items-center gap-2">
          <s.Icon className={cn("h-4 w-4 shrink-0", s.text)} aria-hidden />
          <span className={cn("text-sm font-medium", s.text)}>{label}</span>
          {quality.warnings.length > 0 && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-label={`${quality.warnings.length} scan warning(s)`}
            />
          )}
          <span
            data-testid="scan-safety-score"
            className={cn("ml-auto text-[11px] font-semibold tabular-nums", s.text)}
          >
            {quality.score}% · {quality.label}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
        {/* Ultra-thin embedded health line — feedback without expanding. */}
        <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            data-testid="scan-safety-bar"
            className={cn("block h-full rounded-full transition-all duration-300", s.bar)}
            style={{ width: `${Math.max(4, quality.score)}%` }}
            role="progressbar"
            aria-valuenow={quality.score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Scannability score"
          />
        </span>
      </button>

      {/* Expandable technical drawer. */}
      <div
        id="scan-safety-details"
        data-testid="scan-safety-details"
        data-state={open ? "open" : "closed"}
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-border/60 px-4 py-3">
            {/* Biggest single win first — the model ranks fixes by score gain. */}
            {quality.fixes.length > 0 && (
              <div
                data-testid="scan-safety-bottleneck"
                className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-[11px]"
              >
                <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 text-foreground">
                  Biggest win: <span className="font-medium">{quality.fixes[0].label}</span>{" "}
                  <span className="text-muted-foreground">(+{quality.fixes[0].gain} pts)</span>
                </span>
                {quality.bottleneck === "contrast" && onAutoFixContrast && (
                  <button
                    type="button"
                    data-testid="scan-safety-autofix"
                    onClick={onAutoFixContrast}
                    className="ml-auto shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {trI18n.t("ui.b1f40d275e")}
                  </button>
                )}
              </div>
            )}

            {/* Style-aware preflight warnings, live as sliders move. */}

            {quality.warnings.length > 0 && (
              <ul data-testid="scan-safety-warnings" className="space-y-1.5">
                {quality.warnings.map((w) => (
                  <li
                    key={w.id}
                    className={cn(
                      "flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug",
                      w.severity === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    )}
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="space-y-1 text-[11px]">
              <Metric
                label="Contrast"
                value={`${report.ratio.toFixed(1)}:1`}
                ok={report.ratio >= 4.5}
                okLabel={report.ratio >= 4.5 ? "Pass AA" : "Fails AA"}
              />
              <Metric
                label="Optical profile"
                value={quality.profile.label}
                ok={quality.profile.scorePenalty >= 0.96}
                okLabel={quality.profile.class === "continuous" ? "Sensitive" : "Tolerant"}
              />
              <Metric
                label="Detected modules"
                value={
                  report.moduleCount ? `${report.moduleCount} × ${report.moduleCount} grid` : "—"
                }
                ok={report.moduleCount ? report.moduleCount < 57 : true}
                okLabel={report.dense ? "Dense" : "Optimal"}
              />
              <Metric
                label="Error correction"
                value={`Level ${errorCorrection}`}
                ok={errorCorrection === "H" || errorCorrection === "Q"}
                okLabel={errorCorrection === "H" ? "30% recovery" : "Reduced"}
              />
              <Metric
                label="Quiet zone"
                value={
                  quietZonePx !== undefined
                    ? `${Math.round(quietZonePx)} px${quietZoneModules !== undefined ? ` · ${quietZoneModules.toFixed(1)} modules` : ""}`
                    : "—"
                }
                ok={quietOk}
                okLabel={quietOk ? "Safe border" : `Needs ${minQuiet}`}
              />
              <Metric
                label="Logo coverage"
                value={`${coveragePct.toFixed(1)}% of max ${maxCoveragePct}%`}
                ok={coverageOk}
                okLabel={coverageOk ? "Within limit" : "Over limit"}
              />
              <Metric
                label="Minimum print size"
                value={`${report.minPrintMm} mm`}
                ok={!report.dense}
                okLabel={report.dense ? "Dense" : "Comfortable"}
              />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One transparent metric row with a green/red status tag. */
function Metric({
  label,
  value,
  ok,
  okLabel,
}: {
  label: string;
  value: string;
  ok: boolean;
  okLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto flex items-center gap-2 tabular-nums text-foreground">
        <span>{value}</span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            ok
              ? "bg-highlight text-highlight-foreground"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {okLabel}
        </span>
      </dd>
    </div>
  );
}
