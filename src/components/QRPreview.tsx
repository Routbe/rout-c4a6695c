import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Loader2, ChevronDown, X } from "lucide-react";
import { captionHref, captionSvg, prettyCaption, truncateCaption } from "@/lib/qr-caption";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildExportFilename } from "@/lib/export-filename";
import { FrameStyle } from "./QRStyleTabs";
import { BodyShape } from "./BodyShapeSelector";
import { QRInputFields } from "./QRInputFields";
import { QRType } from "./QRTypeSelector";
import QRCodeStyling, { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";
import {
  findFrame,
  FRAME_VIEWBOX,
  FRAME_QR_SLOT,
  frameFontStack,
  applyFrameTweaks,
  DEFAULT_FRAME_TWEAKS,
  type FrameTweaks,
} from "./QRFrames";
import { ScanSafety } from "./ScanSafety";
import { ExportWarningDialog } from "./ExportWarningDialog";
import { MeetingActionDrawer, ContactActionDrawer } from "./PreviewActionDrawer";
import { analyzeExportRisk, type ExportRiskReport } from "@/lib/scanability";
import { buildMeetingLink } from "@/lib/rich-qr";
import { BrandLoader } from "./BrandLoader";
import { useQrMatrix } from "@/hooks/useQrMatrix";
import { artisticQrSvg, isArtisticPattern } from "@/lib/artistic-patterns";
import { ContrastPreflightDialog } from "./ContrastPreflightDialog";
import { contrastRatio } from "@/lib/scanability";
import {
  guardHeapBeforeExport,
  startExportProfile,
  countSvgNodes,
  readHeap,
} from "@/lib/export-telemetry";
import { i18n as trI18n } from "@/lib/i18n";

/** Only plain hex / rgb(a) colors may reach the frame SVG markup (blocks injected presets). */
function safeSvgColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)$/.test(v)) return v;
  return fallback;
}

/** Structured diagnostics attached to a failed export. */
interface ExportDiagnostics {
  message: string;
  stack?: string;
  timestamp: string;
  moduleCount: number;
  pattern: string;
  format: string;
  size: number;
  /** Pipeline step that threw: preflight, serialize, decode, canvas, encode… */
  stage: string;
  canvas?: string;
  heap?: string;
}

/** Toast body with a details accordion and an immediate retry action. */
function ExportErrorBody({
  diagnostics,
  onRetry,
}: {
  diagnostics: ExportDiagnostics;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2" data-testid="export-error-toast">
      <p className="text-xs">{diagnostics.message}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="export-error-details"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-8 items-center gap-1 rounded-full border border-current/30 px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Details
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          data-testid="export-error-retry"
          onClick={onRetry}
          className="inline-flex min-h-8 items-center rounded-full border border-current/30 px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {trI18n.t("ui.f58f53ea6b")}
        </button>
      </div>
      {open && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-2 text-[10px] leading-tight">
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Instant, worker-generated QR layer.
 *
 * The matrix is encoded in a Web Worker and arrives as a ready-made SVG path,
 * so the main thread only paints — typing never drops a frame.
 */
function InstantQR({
  value,
  fgColor,
  visible,
  matrix,
  label,
}: {
  value: string;
  fgColor: string;
  visible: boolean;
  matrix: { count: number; path: string };
  label: string;
}) {
  const { count, path } = matrix;
  void value;
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {count > 0 && (
        <svg
          viewBox={`0 0 ${count} ${count}`}
          shapeRendering="crispEdges"
          style={{ width: "100%", height: "100%", display: "block" }}
          role="img"
          aria-label={label}
        >
          <path d={path} fill={fgColor} />
        </svg>
      )}
    </div>
  );
}

/** Fixed-size failure card — same footprint as the preview, so nothing shifts. */
function QRErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center"
    >
      <p className="text-xs font-medium text-muted-foreground">QR code could not be generated.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </button>
    </div>
  );
}

interface QRPreviewProps {
  paymentValues?: Record<string, string>;
  onPaymentFieldChange?: (key: string, value: string) => void;
  qrType: QRType;
  value: string;
  onValueChange: (value: string) => void;
  wifiSSID: string;
  onWifiSSIDChange: (ssid: string) => void;
  wifiPassword: string;
  onWifiPasswordChange: (password: string) => void;
  wifiEncryption: "WPA" | "WEP" | "nopass";
  onWifiEncryptionChange: (encryption: "WPA" | "WEP" | "nopass") => void;
  emailAddress: string;
  onEmailAddressChange: (email: string) => void;
  emailSubject: string;
  onEmailSubjectChange: (subject: string) => void;
  emailBody: string;
  onEmailBodyChange: (body: string) => void;
  smsPhone: string;
  onSmsPhoneChange: (phone: string) => void;
  smsMessage: string;
  onSmsMessageChange: (message: string) => void;
  whatsappPhone?: string;
  onWhatsappPhoneChange?: (phone: string) => void;
  whatsappMessage?: string;
  onWhatsappMessageChange?: (message: string) => void;
  qrValue: string;
  fgColor: string;
  bgColor: string;
  bgGradient?: string | null;
  frameStyle: FrameStyle;
  logo: string | null;
  bodyShape?: BodyShape;
  downloadSize?: number;
  downloadFormat?: "png" | "svg" | "jpeg";
  downloadMargin?: number;
  filename?: string;
  profileName?: string;
  dotStyle?: DotType;
  outerCornerStyle?: CornerSquareType;
  innerCornerStyle?: CornerDotType;
  logoSize?: number;
  logoMargin?: number;
  hideBackgroundDots?: boolean;
  frameId?: string | null;
  frameLabel?: string;
  frameFont?: string;
  frameTweaks?: FrameTweaks;
  richValues?: Record<string, string>;
  onRichFieldChange?: (key: string, value: string) => void;
  /** Selected physical print size in millimetres, used by the export check. */
  printMm?: number;
  /** Raises the contrast to a safe pair (used by the export preflight). */
  onAutoFixContrast?: () => void;
  /** Print the short link as readable text under the code (preview + export). */
  captionEnabled?: boolean;
  captionText?: string;
}

const frameStyleClasses: Record<FrameStyle, string> = {
  square: "rounded-none",
  "rounded-sm": "rounded-lg",
  "rounded-md": "rounded-2xl",
  "rounded-lg": "rounded-3xl",
  "rounded-left": "rounded-l-3xl rounded-r-none",
  "rounded-right": "rounded-r-3xl rounded-l-none",
  "pill-h": "rounded-full",
  "pill-v": "rounded-full",
  circle: "rounded-full",
};

// Map BodyShape to qr-code-styling dot types
const bodyShapeToDotType: Record<BodyShape, DotType> = {
  square: "square",
  dots: "dots",
  rounded: "rounded",
  classy: "classy",
  sharp: "classy-rounded",
  // Artistic styles use the custom renderer; these keep the library happy.
  calligraphy: "classy",
  ballpoint: "rounded",
  chalk: "dots",
  mesh: "dots",
};

const bodyShapeToCornerSquareType: Record<BodyShape, CornerSquareType> = {
  square: "square",
  dots: "dot",
  rounded: "extra-rounded",
  classy: "extra-rounded",
  sharp: "square",
  calligraphy: "extra-rounded",
  ballpoint: "square",
  chalk: "extra-rounded",
  mesh: "extra-rounded",
};

const bodyShapeToCornerDotType: Record<BodyShape, CornerDotType> = {
  square: "square",
  dots: "dot",
  rounded: "dot",
  classy: "dot",
  sharp: "square",
  calligraphy: "dot",
  ballpoint: "square",
  chalk: "dot",
  mesh: "dot",
};

export function QRPreview({
  qrType,
  value,
  onValueChange,
  wifiSSID,
  onWifiSSIDChange,
  wifiPassword,
  onWifiPasswordChange,
  wifiEncryption,
  onWifiEncryptionChange,
  emailAddress,
  onEmailAddressChange,
  emailSubject,
  onEmailSubjectChange,
  emailBody,
  onEmailBodyChange,
  smsPhone,
  onSmsPhoneChange,
  smsMessage,
  onSmsMessageChange,
  whatsappPhone,
  onWhatsappPhoneChange,
  whatsappMessage,
  onWhatsappMessageChange,
  paymentValues,
  onPaymentFieldChange,
  qrValue,
  fgColor,
  bgColor,
  bgGradient,
  frameStyle,
  logo,
  bodyShape = "square",
  downloadSize = 300,
  downloadFormat = "png",
  downloadMargin = 72,
  filename = "qrcode",
  profileName,
  dotStyle,
  outerCornerStyle,
  innerCornerStyle,
  logoSize = 0.4,
  logoMargin = 10,
  hideBackgroundDots = true,
  frameId = null,
  frameLabel = "",
  frameFont = "sans",
  frameTweaks = DEFAULT_FRAME_TWEAKS,
  richValues,
  onRichFieldChange,
  printMm,
  onAutoFixContrast,
  captionEnabled = false,
  captionText = "",
}: QRPreviewProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrSize, setQrSize] = useState(220);
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const renderStartRef = useRef(0);
  const [exportRisk, setExportRisk] = useState<ExportRiskReport | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** Cancellation token for the in-flight export, flipped by the Cancel button. */
  const exportTokenRef = useRef<{ cancelled: boolean } | null>(null);

  const [contrastOpen, setContrastOpen] = useState(false);
  /** Set when the user asked us to fix contrast first; fires after the props land. */
  const [pendingExport, setPendingExport] = useState(false);
  const { toast } = useToast();

  const rawValue = qrValue || "https://rout.be";
  // Debounced payload: rapid type-switches / typing no longer trigger a render
  // cycle per keystroke.
  // Optimistic UI: the payload follows keystrokes immediately so the QR matrix
  // morphs in real time — no debounce, no waiting on a server round-trip.
  const displayValue = rawValue;
  const hasInstantPayload = displayValue.trim().length > 0;

  /** Live encoded matrix — powers the instant layer and the honest audit. */
  const matrix = useQrMatrix(displayValue);

  /**
   * The richly styled qr-code-styling layer is expensive; it follows the
   * payload with a short debounce while the worker-driven instant layer keeps
   * up with every keystroke. Result: no main-thread stalls while typing.
   */
  const [styledValue, setStyledValue] = useState(displayValue);
  useEffect(() => {
    const id = setTimeout(() => setStyledValue(displayValue), 120);
    return () => clearTimeout(id);
  }, [displayValue]);

  const markReady = useCallback(() => {
    setQrError(false);
    setQrReady((prev) => {
      if (!prev && renderStartRef.current) {
        const ms = Math.round(performance.now() - renderStartRef.current);
        if (import.meta.env.DEV) console.info(`[qr] render ${ms}ms`);
      }
      return true;
    });
  }, []);

  const retryRender = useCallback(() => {
    setQrError(false);
    setQrReady(false);
    setRenderNonce((n) => n + 1);
  }, []);

  const hasContent = Boolean(qrValue && qrValue.trim().length > 0);

  const resolvedDot: DotType = dotStyle ?? bodyShapeToDotType[bodyShape];
  const resolvedOuter: CornerSquareType =
    outerCornerStyle ?? bodyShapeToCornerSquareType[bodyShape];
  const resolvedInner: CornerDotType = innerCornerStyle ?? bodyShapeToCornerDotType[bodyShape];

  /**
   * Artistic styles bypass qr-code-styling entirely: they are drawn from the
   * raw matrix so the three finder patterns can be kept mathematically exact
   * while only the data modules receive the hand-drawn treatment.
   */
  const artisticStyle = isArtisticPattern(bodyShape) ? bodyShape : null;
  const artisticPreview = useMemo(() => {
    if (!artisticStyle || !matrix.bits.length) return null;
    try {
      return artisticQrSvg({
        bits: matrix.bits,
        style: artisticStyle,
        fgColor,
        outerCornerStyle: resolvedOuter,
        innerCornerStyle: resolvedInner,
        bgColor: "transparent",
        flourishes: artisticStyle === "calligraphy",
        margin: 4,
        size: 1000,
        uid: "preview",
      });
    } catch (error) {
      console.error("[qr] artistic preview failed, falling back", error);
      return null;
    }
  }, [artisticStyle, matrix.bits, fgColor, resolvedOuter, resolvedInner]);

  // Caption: only meaningful without a frame (frames carry their own CTA).
  const captionValue = prettyCaption(captionText);
  // What actually gets printed: shortened in the middle when it is too long.
  const captionDisplay = truncateCaption(captionValue);
  const captionLink = captionHref(captionValue);
  const showCaption = captionEnabled && captionValue.length > 0 && !frameId;

  const activeFrame = findFrame(frameId);
  const effectiveBgForFrame = bgColor === "transparent" ? "#FFFFFF" : bgColor;
  const frameSvg = activeFrame
    ? applyFrameTweaks(
        activeFrame.render({
          color: safeSvgColor(fgColor, "#000000"),
          bg: safeSvgColor(effectiveBgForFrame, "#FFFFFF"),
          label: frameLabel || activeFrame.defaultLabel,
          font: frameFontStack(frameFont) ?? undefined,
        }),
        frameTweaks,
      )
    : null;

  // Initialize QR code once — the container is always emptied first so
  // StrictMode double-invokes / HMR can never stack two canvases on top
  // of each other (the "double QR" bug).
  useEffect(() => {
    const host = qrRef.current;
    if (!host) return;
    renderStartRef.current = performance.now();

    const instance = new QRCodeStyling({
      // SVG preview keeps dots and the centre logo crisp at every size / DPR
      // (a canvas preview rasterises at CSS pixels and looks blurry).
      type: "svg",
      width: qrSize,
      height: qrSize,
      data: displayValue,
      dotsOptions: { color: fgColor, type: resolvedDot },
      cornersSquareOptions: { color: fgColor, type: resolvedOuter },
      cornersDotOptions: { color: fgColor, type: resolvedInner },
      backgroundOptions: { color: "transparent" },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: logoMargin,
        imageSize: logoSize,
        hideBackgroundDots,
      },
      image: logo || undefined,
      qrOptions: { errorCorrectionLevel: "H" },
    });

    host.innerHTML = "";
    instance.append(host);
    qrCodeRef.current = instance;

    // Reveal the code (and drop the skeleton) as soon as the SVG/canvas lands.
    let tries = 0;
    const poll = window.setInterval(() => {
      tries += 1;
      if (host.querySelector("svg, canvas")) {
        markReady();
        window.clearInterval(poll);
      } else if (tries > 60) {
        setQrError(true);
        window.clearInterval(poll);
      }
    }, 50);

    return () => {
      window.clearInterval(poll);
      host.innerHTML = "";
      if (qrCodeRef.current === instance) qrCodeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(frameSvg), renderNonce]);

  // Update QR code when props change.
  //
  // A remote logo (brand favicon) can fail to load, which used to leave the
  // host element empty — the "preview disappears after Brand it" bug. The
  // update is wrapped so a rejected image never kills the canvas, and a
  // watchdog re-appends the instance if the host ended up blank.
  useEffect(() => {
    const instance = qrCodeRef.current;
    const host = qrRef.current;
    if (!instance || !host) return;

    const options = {
      width: qrSize,
      height: qrSize,
      data: styledValue,
      dotsOptions: { color: fgColor, type: resolvedDot },
      cornersSquareOptions: { color: fgColor, type: resolvedOuter },
      cornersDotOptions: { color: fgColor, type: resolvedInner },
      backgroundOptions: { color: "transparent" },
      imageOptions: {
        crossOrigin: "anonymous" as const,
        margin: logoMargin,
        imageSize: logoSize,
        hideBackgroundDots,
      },
      image: logo || undefined,
    };

    const ensureVisible = () => {
      if (host.childNodes.length === 0) {
        try {
          instance.append(host);
        } catch {
          /* the instance is being torn down */
        }
      }
      if (host.childNodes.length > 0) markReady();
    };

    try {
      const result = instance.update(options) as unknown;
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).then(ensureVisible).catch(() => {
          // Logo failed to load — keep the code, drop the image.
          try {
            instance.update({ ...options, image: undefined });
          } catch {
            /* ignore */
          }
          ensureVisible();
        });
      }
    } catch {
      try {
        instance.update({ ...options, image: undefined });
      } catch {
        /* ignore */
      }
    }

    const raf = requestAnimationFrame(ensureVisible);
    const timer = setTimeout(ensureVisible, 350);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [
    styledValue,
    fgColor,
    bgColor,
    resolvedDot,
    resolvedOuter,
    resolvedInner,
    qrSize,
    logo,
    logoMargin,
    logoSize,
    hideBackgroundDots,
  ]);

  // Measure once before paint (no visible size jump), then follow resizes.
  useLayoutEffect(() => {
    let rafId = 0;

    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const availableWidth = el.offsetWidth - 64;
      setQrSize((prev) => {
        const next = Math.max(150, availableWidth);
        return Math.abs(next - prev) > 1 ? next : prev;
      });
    };

    measure();

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    window.addEventListener("resize", handleResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
    };
  }, []);

  const performDownload = useCallback(async () => {
    if (!qrCodeRef.current) return;
    // Fresh cancellation token for this run; the Cancel button flips it and the
    // pipeline aborts at its next yield point instead of finishing the file.
    const token = { cancelled: false };
    exportTokenRef.current = token;
    const abortIfCancelled = () => {
      if (token.cancelled) {
        const e = new Error("Export cancelled");
        e.name = "AbortError";
        throw e;
      }
    };
    setExporting(true);
    // Format and density come straight from the sidebar panels.
    const resolvedFormat: "png" | "svg" | "jpeg" = downloadFormat;
    const isVector = resolvedFormat === "svg";
    const rasterSize = activeFrame
      ? Math.max(2400, Math.round(downloadSize))
      : Math.max(2000, Math.round(downloadSize));
    const exportSize = isVector ? Math.max(1000, Math.round(downloadSize)) : rasterSize;
    // High-precision profile + OOM guard around the whole export sequence.
    const endProfile = startExportProfile(resolvedFormat);
    let exportedNodes = 0;
    let succeeded = false;
    let cancelled = false;
    // Tracks the pipeline step for the structured failure log.
    let stage = "preflight";
    let canvasDims = "";
    try {
      // Structured, slugified name: rout-<preset>-<format>-<timestamp>.<ext>
      const presetName = (filename || "").trim() || `qr-${qrType || "url"}`;
      const exportedAt = new Date();

      // Preflight: refuse configurations the browser cannot rasterise before
      // we allocate a multi-megapixel canvas.
      if (!isVector) {
        if (exportSize > 8192) throw new Error("Requested print size exceeds canvas limits");
        const heapProblem = guardHeapBeforeExport(exportSize * exportSize);
        if (heapProblem) throw new Error(heapProblem);
        const probe = document.createElement("canvas");
        probe.width = 1;
        probe.height = 1;
        if (!probe.getContext("2d")) throw new Error("Canvas rendering is unavailable");
      }
      if (!matrix.count) throw new Error("QR matrix is empty — nothing to export");
      // Yield one frame so the button reaches its loading state before the
      // heavy rasterisation blocks anything.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      abortIfCancelled();

      const exportMargin = Math.round(downloadMargin * (exportSize / Math.max(1, downloadSize)));

      const triggerBlob = (blob: Blob, ext: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = buildExportFilename({
          preset: presetName,
          format: ext,
          date: exportedAt,
        });
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };

      /**
       * Rasterise an SVG string at an exact pixel size.
       *
       * The decode, the draw and the encode are separated by frame yields so
       * the main thread stays responsive, and every temporary canvas, context
       * and blob URL is released the moment the bytes exist.
       */
      const rasterise = async (svg: string, w: number, h: number): Promise<Blob> => {
        stage = "svg-serialize";
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        let canvas: HTMLCanvasElement | null = null;
        try {
          stage = "svg-decode";
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("Vector source could not be decoded"));
            img.src = url;
          });
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          abortIfCancelled();
          stage = "canvas-alloc";
          canvasDims = `${w}×${h}`;
          canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas rendering error: 2D context unavailable");
          // One state switch, one draw: the whole vector tree is rasterised in
          // a single batched operation at the target scale.
          stage = "canvas-draw";
          if (resolvedFormat === "jpeg" || (bgColor && bgColor !== "transparent")) {
            ctx.fillStyle = bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF";
            ctx.fillRect(0, 0, w, h);
          }
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
          img.src = "";
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          abortIfCancelled();
          stage = "encode";
          const mime = resolvedFormat === "jpeg" ? "image/jpeg" : "image/png";
          const blob = await new Promise<Blob>((res, rej) =>
            canvas!.toBlob(
              (b) => (b ? res(b) : rej(new Error("Encoding the print file failed"))),
              mime,
              0.95,
            ),
          );
          return blob;
        } finally {
          URL.revokeObjectURL(url);
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas = null;
          }
        }
      };

      // Artistic styles are exported from our own renderer — always true vector
      // for SVG, and rasterised at print resolution otherwise.
      const artisticExport =
        artisticStyle && matrix.bits.length
          ? artisticQrSvg({
              bits: matrix.bits,
              style: artisticStyle,
              fgColor,
              outerCornerStyle: resolvedOuter,
              innerCornerStyle: resolvedInner,
              bgColor: activeFrame ? "transparent" : bgColor || "#FFFFFF",
              flourishes: artisticStyle === "calligraphy",
              margin: 4,
              size: exportSize,
              uid: "export",
            })
          : null;

      if (artisticExport && !activeFrame && showCaption) {
        // Artistic renderer + caption band, still one composed document.
        const composed = captionSvg({
          qrHref: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(artisticExport)))}`,
          size: exportSize,
          text: captionDisplay,
          color: fgColor,
          bg: bgColor || "#FFFFFF",
          fontFamily: frameFontStack(frameFont) ?? undefined,
        });
        if (isVector) {
          triggerBlob(new Blob([composed.svg], { type: "image/svg+xml" }), "svg");
        } else {
          triggerBlob(
            await rasterise(composed.svg, composed.width, composed.height),
            resolvedFormat,
          );
        }
        toast({
          title: "Downloaded!",
          description: `QR met short link opgeslagen als ${resolvedFormat.toUpperCase()}.`,
        });
        succeeded = true;
        return;
      }

      if (artisticExport && !activeFrame) {
        exportedNodes = countSvgNodes(artisticExport);
        if (isVector) {
          triggerBlob(new Blob([artisticExport], { type: "image/svg+xml" }), "svg");
        } else {
          triggerBlob(await rasterise(artisticExport, exportSize, exportSize), resolvedFormat);
        }
        toast({
          title: "Downloaded!",
          description: isVector
            ? "Your QR code has been saved as an SVG (vector)."
            : `Your QR code has been saved as ${exportSize}×${exportSize}px ${resolvedFormat.toUpperCase()}.`,
        });
        succeeded = true;
        return;
      }

      const qrOnly = new QRCodeStyling({
        width: exportSize,
        height: exportSize,
        margin: exportMargin,
        type: isVector ? "svg" : "canvas",
        data: displayValue,
        dotsOptions: { color: fgColor, type: resolvedDot },
        cornersSquareOptions: { color: fgColor, type: resolvedOuter },
        cornersDotOptions: { color: fgColor, type: resolvedInner },
        backgroundOptions: { color: bgColor || "#FFFFFF" },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: logoMargin,
          imageSize: logoSize,
          hideBackgroundDots,
        },
        image: logo || undefined,
        qrOptions: { errorCorrectionLevel: "H" },
      });

      if (!activeFrame && showCaption) {
        // Composite the QR and the caption band into a single artefact so the
        // download matches the preview 1:1.
        const rawQr = (await qrOnly.getRawData(isVector ? "svg" : "png")) as Blob | null;
        if (!rawQr) throw new Error("QR render failed");
        const qrDataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = rej;
          r.readAsDataURL(rawQr);
        });
        const composed = captionSvg({
          qrHref: qrDataUrl,
          size: exportSize,
          text: captionDisplay,
          color: fgColor,
          bg: bgColor || "#FFFFFF",
          fontFamily: frameFontStack(frameFont) ?? undefined,
        });
        if (isVector) {
          triggerBlob(new Blob([composed.svg], { type: "image/svg+xml" }), "svg");
        } else {
          triggerBlob(
            await rasterise(composed.svg, composed.width, composed.height),
            resolvedFormat,
          );
        }
        toast({
          title: "Downloaded!",
          description: `QR met short link opgeslagen als ${resolvedFormat.toUpperCase()}.`,
        });
        succeeded = true;
        return;
      }

      if (!activeFrame) {
        // qr-code-styling appends the extension itself — hand it the stem only.
        const vectorName = buildExportFilename({
          preset: presetName,
          format: resolvedFormat,
          date: exportedAt,
        }).replace(/\.[a-z0-9]+$/i, "");
        await qrOnly.download({ name: vectorName, extension: resolvedFormat });
        toast({
          title: "Downloaded!",
          description: isVector
            ? "Your QR code has been saved as an SVG (vector)."
            : `Your QR code has been saved as ${exportSize}×${exportSize}px ${resolvedFormat.toUpperCase()}.`,
        });
        succeeded = true;
        return;
      }

      // Frame active — for SVG we embed the QR as vector markup so the export
      // stays resolution-independent; raster formats use a high-res bitmap.
      const qrBlob = artisticExport
        ? isVector
          ? new Blob([artisticExport], { type: "image/svg+xml" })
          : await rasterise(artisticExport, exportSize, exportSize)
        : await (async () => {
            const qrRaw = (await qrOnly.getRawData(isVector ? "svg" : "png")) as Blob | null;
            if (!qrRaw) throw new Error("QR render failed");
            return qrRaw instanceof Blob
              ? qrRaw
              : new Blob([qrRaw as BlobPart], { type: isVector ? "image/svg+xml" : "image/png" });
          })();
      const qrDataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(qrBlob);
      });

      const framedSvg = applyFrameTweaks(
        activeFrame.render({
          color: fgColor,
          bg: bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF",
          label: frameLabel || activeFrame.defaultLabel,
          font: frameFontStack(frameFont) ?? undefined,
          qrHref: qrDataUrl,
        }),
        frameTweaks,
      );

      if (isVector) {
        triggerBlob(new Blob([framedSvg], { type: "image/svg+xml" }), "svg");
      } else {
        const scale = exportSize / FRAME_QR_SLOT.size;
        const canvasW = Math.round(FRAME_VIEWBOX.w * scale);
        const canvasH = Math.round(FRAME_VIEWBOX.h * scale);
        const svgUrl = URL.createObjectURL(new Blob([framedSvg], { type: "image/svg+xml" }));
        let canvas: HTMLCanvasElement | null = null;
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("Frame artwork could not be decoded"));
            img.src = svgUrl;
          });
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          abortIfCancelled();
          canvas = document.createElement("canvas");
          canvas.width = canvasW;
          canvas.height = canvasH;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas rendering error: 2D context unavailable");
          if (resolvedFormat === "jpeg") {
            ctx.fillStyle = bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF";
            ctx.fillRect(0, 0, canvasW, canvasH);
          }
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, canvasW, canvasH);
          img.src = "";
          const mime = resolvedFormat === "jpeg" ? "image/jpeg" : "image/png";
          const outBlob: Blob = await new Promise((res, rej) =>
            canvas!.toBlob(
              (b) => (b ? res(b) : rej(new Error("Encoding the framed file failed"))),
              mime,
              0.95,
            ),
          );
          triggerBlob(outBlob, resolvedFormat);
        } finally {
          URL.revokeObjectURL(svgUrl);
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas = null;
          }
        }
      }

      toast({
        title: "Downloaded!",
        description: `Framed QR saved as ${resolvedFormat.toUpperCase()}.`,
      });
      succeeded = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === "AbortError") {
        // User-initiated cancel: no failure diagnostics, just a calm notice.
        cancelled = true;
        toast({
          title: "Export cancelled",
          description: "No file was saved.",
        });
        return;
      }
      const heap = readHeap();
      const heapInfo = heap.supported
        ? `${Math.round(heap.usedMB)}/${Math.round(heap.limitMB)} MB (${Math.round(heap.pressure * 100)}%)`
        : "unsupported";
      const diagnostics: ExportDiagnostics = {
        message: `Export failed: ${error.message}`,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        moduleCount: matrix.count,
        pattern: bodyShape,
        format: resolvedFormat,
        size: exportSize,
        stage,
        canvas: canvasDims || `${exportSize}×${exportSize} (not allocated)`,
        heap: heapInfo,
      };
      console.error("[ROUT Export Engine]", {
        error,
        stage,
        timestamp: diagnostics.timestamp,
        configuration: {
          grid: `${matrix.count}×${matrix.count}`,
          pattern: bodyShape,
          format: resolvedFormat,
          size: exportSize,
          canvas: diagnostics.canvas,
          heap: heapInfo,
          frame: activeFrame?.id ?? null,
        },
        stack: error.stack,
      });

      toast({
        title: "Download failed",
        description: (
          <ExportErrorBody
            diagnostics={diagnostics}
            onRetry={() => void performDownloadRef.current?.()}
          />
        ),
        variant: "destructive",
      });
    } finally {
      // Rollback: the button always returns to its interactive state.
      setExporting(false);
      exportTokenRef.current = null;
      endProfile(succeeded ? "success" : cancelled ? "cancelled" : "failure", exportedNodes);
    }
  }, [
    toast,
    downloadSize,
    downloadFormat,
    downloadMargin,
    displayValue,
    bodyShape,
    fgColor,
    bgColor,
    resolvedDot,
    resolvedOuter,
    resolvedInner,
    logo,
    filename,
    logoMargin,
    logoSize,
    hideBackgroundDots,
    activeFrame,
    frameLabel,
    frameFont,
    frameTweaks,
    showCaption,
    captionDisplay,
    artisticStyle,
    matrix.bits,
    qrType,
  ]);

  /** Live contrast of the exported pair (transparent counts as white paper). */
  const effectiveRatio = useMemo(
    () => contrastRatio(fgColor, bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF"),
    [fgColor, bgColor],
  );

  // Keeps the toast retry action pointed at the latest export closure.
  const performDownloadRef = useRef<(() => Promise<void>) | null>(null);
  performDownloadRef.current = performDownload;

  /** Quiet-zone + coverage telemetry, shared by the audit card and preflight. */
  const telemetry = useMemo(() => {
    const count = matrix.count;
    const modulePx = count > 0 ? (downloadSize - downloadMargin * 2) / count : 0;
    return {
      count,
      quietZonePx: downloadMargin,
      quietZoneModules: modulePx > 0 ? downloadMargin / modulePx : undefined,
      logoCoverage: logo ? logoSize * logoSize : 0,
    };
  }, [matrix.count, downloadSize, downloadMargin, logo, logoSize]);

  /** Density / print pre-flight, then either warn or download straight away. */
  const runExport = useCallback(() => {
    const count = matrix.count;
    const modulePx = count > 0 ? (downloadSize - downloadMargin * 2) / count : 0;
    const quietZoneModules = modulePx > 0 ? downloadMargin / modulePx : undefined;
    const risk = analyzeExportRisk({
      fgColor,
      bgColor,
      payload: displayValue,
      printMm,
      moduleCount: count || undefined,
      quietZoneModules,
      logoCoverage: logo ? logoSize * logoSize : undefined,
    });
    if (risk.risky) {
      setExportRisk(risk);
      setRiskOpen(true);
      return;
    }
    void performDownload();
  }, [
    fgColor,
    bgColor,
    displayValue,
    printMm,
    performDownload,
    matrix.count,
    downloadSize,
    downloadMargin,
    logo,
    logoSize,
  ]);

  /**
   * Contrast preflight: an export below WCAG AA (4.5:1) is intercepted so the
   * user can auto-correct before a low-contrast file reaches print.
   */
  const downloadQR = useCallback(() => {
    if (exporting) return;
    if (effectiveRatio < 4.5) {
      setContrastOpen(true);
      return;
    }
    runExport();
  }, [exporting, effectiveRatio, runExport]);

  // The auto-fix changes colours through the parent, so the export waits one
  // render for the corrected props to arrive.
  useEffect(() => {
    if (!pendingExport) return;
    if (effectiveRatio < 4.5) return;
    setPendingExport(false);
    runExport();
  }, [pendingExport, effectiveRatio, runExport]);

  /** Flip the in-flight export's cancellation token; the pipeline aborts at its next yield. */
  const cancelExport = useCallback(() => {
    if (exportTokenRef.current) exportTokenRef.current.cancelled = true;
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (qrCodeRef.current) {
      try {
        // Safari requires a Promise to be passed to ClipboardItem, not a resolved Blob
        const makeImagePromise = async (): Promise<Blob> => {
          const rawData = await qrCodeRef.current!.getRawData("png");
          if (rawData && rawData instanceof Blob) {
            return rawData;
          }
          throw new Error("Failed to generate image");
        };

        // Use the promise directly for Safari compatibility
        await navigator.clipboard.write([new ClipboardItem({ "image/png": makeImagePromise() })]);

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: "Copied!",
          description: "QR code copied to clipboard.",
        });
      } catch (err) {
        // Fallback: Try to copy the URL/text value instead
        try {
          await navigator.clipboard.writeText(displayValue);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          toast({
            title: "Copied!",
            description: "QR code link copied to clipboard.",
          });
        } catch {
          toast({
            title: "Copy not supported",
            description: "Your browser doesn't support copying images. Try downloading instead.",
            variant: "destructive",
          });
        }
      }
    }
  }, [toast, displayValue]);

  return (
    <div ref={containerRef} data-qr-container className="flex flex-col items-center gap-6 w-full">
      {/* QR Code Display — always rendered on a real white sheet (even in dark
          mode) so the preview stays scannable and print-accurate. */}
      <div
        data-interface-artwork
        className={cn(
          "w-full max-w-[320px] overflow-hidden p-3 sm:p-4 transition-colors duration-150",
          frameStyleClasses[frameStyle],
        )}
        style={{
          backgroundColor: bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF",
          background: bgGradient || (bgColor && bgColor !== "transparent" ? bgColor : "#FFFFFF"),
        }}
      >
        {frameSvg ? (
          <div
            className="relative w-full"
            style={{ aspectRatio: `${FRAME_VIEWBOX.w} / ${FRAME_VIEWBOX.h}` }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              dangerouslySetInnerHTML={{ __html: frameSvg }}
            />
            <div
              className="absolute"
              style={{
                left: `${(FRAME_QR_SLOT.x / FRAME_VIEWBOX.w) * 100}%`,
                top: `${(FRAME_QR_SLOT.y / FRAME_VIEWBOX.h) * 100}%`,
                width: `${(FRAME_QR_SLOT.size / FRAME_VIEWBOX.w) * 100}%`,
                height: `${(FRAME_QR_SLOT.size / FRAME_VIEWBOX.h) * 100}%`,
              }}
            >
              {!qrError && !hasInstantPayload && <BrandLoader label="Building QR code…" />}
              {!qrError && hasInstantPayload && (
                <InstantQR
                  value={displayValue}
                  fgColor={fgColor}
                  visible={!qrReady && !artisticPreview}
                  matrix={matrix}
                  label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
                />
              )}
              {qrError && <QRErrorState onRetry={retryRender} />}
              <div
                ref={qrRef}
                role="img"
                aria-label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
                aria-hidden={!qrReady || qrError || Boolean(artisticPreview)}
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity duration-[250ms] ease-in-out [&_canvas]:!w-full [&_canvas]:!h-full [&_svg]:!w-full [&_svg]:!h-full",
                  qrReady && !qrError && !artisticPreview ? "opacity-100" : "opacity-0",
                )}
              />
              {artisticPreview && !qrError && (
                <div
                  className="absolute inset-0 [&_svg]:!w-full [&_svg]:!h-full"
                  role="img"
                  aria-label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
                  dangerouslySetInnerHTML={{ __html: artisticPreview }}
                />
              )}
            </div>
          </div>
        ) : (
          // Fixed square slot: the skeleton occupies the exact space the QR will
          // take, so nothing shifts once it finishes rendering.
          <div
            className="relative mx-auto w-full"
            style={{ maxWidth: qrSize, aspectRatio: "1 / 1" }}
          >
            {!qrError && !hasInstantPayload && <BrandLoader label="Building QR code…" />}
            {!qrError && hasInstantPayload && (
              <InstantQR
                value={displayValue}
                fgColor={fgColor}
                visible={!qrReady && !artisticPreview}
                matrix={matrix}
                label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
              />
            )}
            {qrError && <QRErrorState onRetry={retryRender} />}
            <div
              ref={qrRef}
              role="img"
              aria-label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
              aria-hidden={!qrReady || qrError || Boolean(artisticPreview)}
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-opacity duration-[250ms] ease-in-out [&_canvas]:!w-full [&_canvas]:!h-full [&_svg]:!w-full [&_svg]:!h-full",
                qrReady && !qrError && !artisticPreview ? "opacity-100" : "opacity-0",
              )}
            />
            {artisticPreview && !qrError && (
              <div
                className="absolute inset-0 [&_svg]:!w-full [&_svg]:!h-full"
                role="img"
                aria-label={`QR code voor profiel ${profileName || richValues?.name || richValues?.handle || filename}`}
                dangerouslySetInnerHTML={{ __html: artisticPreview }}
              />
            )}
          </div>
        )}

        {/* Readable short link — same text, size and colour as the export.
            The tooltip trigger is the focusable element itself, so keyboard
            users get the full URL on focus, not only on hover. */}
        {showCaption && (
          <p
            className="mx-auto mt-3 w-full max-w-full truncate text-center font-medium tracking-wide"
            style={{
              color: fgColor,
              fontSize: Math.max(11, Math.round(qrSize * 0.055)),
              fontFamily: frameFontStack(frameFont) ?? undefined,
            }}
          >
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {captionLink ? (
                    <a
                      href={captionLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open short link ${captionValue}`}
                      className="rounded-sm text-inherit no-underline outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {captionDisplay}
                    </a>
                  ) : (
                    <span
                      aria-label={captionValue}
                      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {captionDisplay}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[18rem] break-all text-xs">
                  {captionValue}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
        )}
      </div>

      {/* Live scan-safety readout */}
      <ScanSafety
        fgColor={fgColor}
        bgColor={bgColor}
        payload={displayValue}
        moduleCount={matrix.count || undefined}
        quietZonePx={telemetry.quietZonePx}
        quietZoneModules={telemetry.quietZoneModules}
        logoCoverage={telemetry.logoCoverage}
        errorCorrection="H"
        patternStyle={bodyShape}
        onAutoFixContrast={onAutoFixContrast}
      />

      {/* Type-specific action drawers */}
      {qrType === "meeting" && (
        <MeetingActionDrawer
          link={buildMeetingLink(richValues ?? {})}
          passcode={(richValues?.passcode ?? "").trim()}
        />
      )}
      {qrType === "vcard" && <ContactActionDrawer values={richValues ?? {}} />}

      <ExportWarningDialog
        open={riskOpen}
        onOpenChange={setRiskOpen}
        risk={exportRisk}
        onFix={() => setRiskOpen(false)}
        onDownloadAnyway={() => {
          setRiskOpen(false);
          void performDownload();
        }}
      />

      <ContrastPreflightDialog
        open={contrastOpen}
        onOpenChange={setContrastOpen}
        ratio={effectiveRatio}
        onFixAndDownload={() => {
          setContrastOpen(false);
          if (onAutoFixContrast) {
            setPendingExport(true);
            onAutoFixContrast();
          } else {
            runExport();
          }
        }}
        onDownloadAnyway={() => {
          setContrastOpen(false);
          runExport();
        }}
      />

      {/* Action Buttons */}
      <div className="flex items-center gap-3 w-full">
        <div className="relative flex-1">
          {/* Glow effect */}
          <div
            className={cn(
              "absolute inset-0 rounded-full blur-lg translate-y-1 transition-opacity",
              hasContent && !exporting ? "opacity-40" : "opacity-0",
            )}
            style={{
              background:
                "linear-gradient(91deg, #7DF3C4 0%, #2EE59D 36.54%, #2EE59D 67.26%, #7DF3C4 100%)",
            }}
          />
          <Button
            onClick={downloadQR}
            data-testid="download-qr"
            disabled={!hasContent || exporting}
            aria-busy={exporting}
            className={cn(
              "relative w-full h-12 rounded-xl py-3 font-medium shadow-sm border-0 transition-all gap-2",
              hasContent && !exporting
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {exporting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {exporting ? "Rendering export…" : "Download QR code"}
          </Button>
        </div>
        {exporting ? (
          <Button
            variant="outline"
            onClick={cancelExport}
            data-testid="cancel-export"
            aria-label="Cancel export"
            title="Stop rendering this export"
            className="h-12 rounded-xl px-4 gap-2 border border-input font-medium hover:bg-accent"
          >
            <X className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Cancel</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={copyToClipboard}
            data-testid="copy-qr"
            aria-label={copied ? "QR code gekopieerd" : "QR code kopiëren"}
            disabled={!hasContent}
            title="Copy the QR image to your clipboard"
            className={cn(
              "h-12 rounded-xl px-4 gap-2 border border-input font-medium",
              hasContent ? "hover:bg-accent" : "cursor-not-allowed opacity-50",
            )}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </Button>
        )}
      </div>

      {/* Input Fields */}
      <div className="w-full">
        <QRInputFields
          paymentValues={paymentValues}
          onPaymentFieldChange={onPaymentFieldChange}
          qrType={qrType}
          value={value}
          onValueChange={onValueChange}
          wifiSSID={wifiSSID}
          onWifiSSIDChange={onWifiSSIDChange}
          wifiPassword={wifiPassword}
          onWifiPasswordChange={onWifiPasswordChange}
          wifiEncryption={wifiEncryption}
          onWifiEncryptionChange={onWifiEncryptionChange}
          emailAddress={emailAddress}
          onEmailAddressChange={onEmailAddressChange}
          emailSubject={emailSubject}
          onEmailSubjectChange={onEmailSubjectChange}
          emailBody={emailBody}
          onEmailBodyChange={onEmailBodyChange}
          smsPhone={smsPhone}
          onSmsPhoneChange={onSmsPhoneChange}
          smsMessage={smsMessage}
          onSmsMessageChange={onSmsMessageChange}
          whatsappPhone={whatsappPhone}
          onWhatsappPhoneChange={onWhatsappPhoneChange}
          whatsappMessage={whatsappMessage}
          onWhatsappMessageChange={onWhatsappMessageChange}
          richValues={richValues}
          onRichFieldChange={onRichFieldChange}
        />
      </div>
    </div>
  );
}
