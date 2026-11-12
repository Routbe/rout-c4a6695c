import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { BRAND_SHAPES, detectBrand, loadLogoDataUrl } from "@/lib/brand";
import { toast } from "sonner";
import { contrastRatio, AA_TARGET } from "@/lib/wcag";
import { BrandSuggestionCard, type BrandApplyOptions } from "./BrandSuggestionCard";
import { roundImageDataUrl } from "@/lib/logo-image";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { QRType } from "./QRTypeSelector";
import { FileUploadInput } from "./FileUploadInput";
import { ThemePresets, themePresets, ThemePreset } from "./ThemePresets";
import { PatternPresetRow, BodyShape } from "./BodyShapeSelector";
import { ColorPicker } from "./ColorPicker";
import { DPISelector } from "./DPISelector";
import { InfoHint } from "./InfoHint";
import { HelperHint } from "./QRInputFields";
import { FormatSelector, QRFormat } from "./FormatSelector";
import { MarginSelector } from "./MarginSelector";
import { FilenameInput } from "./FilenameInput";
import { CustomizeShapesModal } from "./CustomizeShapesModal";
import { FrameLibrary } from "./FrameLibrary";
import { DEFAULT_FRAME_TWEAKS, type FrameTweaks } from "./QRFrames";
import { ContrastInlineBadge } from "./ContrastBadge";
import { StylePresets } from "./StylePresets";
import type { QrStyleSnapshot } from "@/lib/qr-presets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Upload } from "lucide-react";
import { SelectionIndicator } from "./SelectionIndicator";
import { NoneGlyph } from "./NoneGlyph";
import { PickerAnnouncer } from "./PickerAnnouncer";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";

import { useI18n } from "@/lib/i18n";

import { RoutLogo, routBunnySrc } from "./RoutLogo";

import type { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";

/**
 * Root cause (bug #2, contrast safety): extracted brand palettes can be
 * identical, transparent, or simply low-contrast (e.g. a light logo colour on
 * a light card) — applying them verbatim can make the QR modules blend into
 * the background and look "wiped". Every brand colour application is routed
 * through this guard so the matrix always stays legible.
 */
const BRAND_FALLBACK_FG = "#0B1120";

function safeBrandPalette(fgColor: string, bgColor: string): { fgColor: string; bgColor: string } {
  const fg = (fgColor || "").trim();
  const bgRaw = (bgColor || "").trim();
  const bg = !bgRaw || bgRaw === "transparent" ? "#FFFFFF" : bgRaw;
  if (!fg || fg.toLowerCase() === bg.toLowerCase() || contrastRatio(fg, bg) < AA_TARGET) {
    return { fgColor: BRAND_FALLBACK_FG, bgColor: bg };
  }
  return { fgColor: fg, bgColor: bgRaw || bg };
}

export type FrameStyle =
  | "square"
  | "rounded-sm"
  | "rounded-md"
  | "rounded-lg"
  | "rounded-left"
  | "rounded-right"
  | "pill-h"
  | "pill-v"
  | "circle";

interface QRStyleTabsProps {
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
  frameStyle: FrameStyle;
  onFrameStyleChange: (style: FrameStyle) => void;
  fgColor: string;
  onFgColorChange: (color: string) => void;
  bgColor: string;
  onBgColorChange: (color: string) => void;
  bgGradient?: string | null;
  onBgGradientChange?: (gradient: string | null) => void;
  logo: string | null;
  onLogoChange: (logo: string | null) => void;
  bodyShape?: BodyShape;
  onBodyShapeChange?: (shape: BodyShape) => void;
  qrSize?: number;
  onQrSizeChange?: (size: number) => void;
  physicalSize?: number;
  onPhysicalSizeChange?: (mm: number) => void;
  dpi?: number;
  onDpiChange?: (dpi: number) => void;
  sizeUnit?: "mm" | "in";
  onSizeUnitChange?: (u: "mm" | "in") => void;
  qrFormat?: QRFormat;
  onQrFormatChange?: (format: QRFormat) => void;
  qrMargin?: number;
  onQrMarginChange?: (margin: number) => void;
  filename?: string;
  onFilenameChange?: (v: string) => void;
  dotStyle?: DotType;
  onDotStyleChange?: (v: DotType) => void;
  outerCornerStyle?: CornerSquareType;
  onOuterCornerStyleChange?: (v: CornerSquareType) => void;
  innerCornerStyle?: CornerDotType;
  onInnerCornerStyleChange?: (v: CornerDotType) => void;
  logoSize?: number;
  onLogoSizeChange?: (v: number) => void;
  logoMargin?: number;
  onLogoMarginChange?: (v: number) => void;
  hideBackgroundDots?: boolean;
  onHideBackgroundDotsChange?: (v: boolean) => void;
  frameId?: string | null;
  onFrameIdChange?: (id: string | null) => void;
  frameLabel?: string;
  onFrameLabelChange?: (label: string) => void;
  frameFont?: string;
  frameTweaks?: FrameTweaks;
  onFrameTweaksChange?: (t: FrameTweaks) => void;
  onFrameFontChange?: (id: string) => void;
  /** Print the short link as readable text under the QR. */
  captionEnabled?: boolean;
  onCaptionEnabledChange?: (v: boolean) => void;
  captionText?: string;
  onCaptionTextChange?: (v: string) => void;
  /** Suggested caption (the active short link), shown as a one-tap fill. */
  captionSuggestion?: string;
}

const frameStyles: { id: FrameStyle; preview: string }[] = [
  { id: "square", preview: "rounded-none" },
  { id: "rounded-sm", preview: "rounded-sm" },
  { id: "rounded-md", preview: "rounded-md" },
  { id: "rounded-lg", preview: "rounded-lg" },
  { id: "rounded-left", preview: "rounded-l-lg rounded-r-none" },
  { id: "rounded-right", preview: "rounded-r-lg rounded-l-none" },
  { id: "pill-h", preview: "rounded-full" },
  { id: "pill-v", preview: "rounded-full" },
  { id: "circle", preview: "rounded-full" },
];

/** Compact labelled slider used by the centre-logo controls. */
function LogoSlider({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}

export function QRStyleTabs({
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
  frameStyle,
  onFrameStyleChange,
  fgColor,
  onFgColorChange,
  bgColor,
  onBgColorChange,
  bgGradient,
  onBgGradientChange,
  logo,
  onLogoChange,
  bodyShape,
  onBodyShapeChange,
  qrSize,
  onQrSizeChange,
  physicalSize = 55,
  onPhysicalSizeChange,
  dpi = 300,
  onDpiChange,
  sizeUnit = "mm",
  onSizeUnitChange,
  qrFormat = "png",
  onQrFormatChange,
  qrMargin = 72,
  onQrMarginChange,
  filename = "qrcode",
  onFilenameChange,
  dotStyle,
  onDotStyleChange,
  outerCornerStyle,
  onOuterCornerStyleChange,
  innerCornerStyle,
  onInnerCornerStyleChange,
  logoSize = 0.4,
  onLogoSizeChange,
  logoMargin = 10,
  onLogoMarginChange,
  hideBackgroundDots = true,
  onHideBackgroundDotsChange,
  frameId = null,
  onFrameIdChange,
  frameLabel = "",
  onFrameLabelChange,
  frameFont = "sans",
  frameTweaks = DEFAULT_FRAME_TWEAKS,
  onFrameTweaksChange,
  onFrameFontChange,
  captionEnabled = false,
  onCaptionEnabledChange,
  captionText = "",
  onCaptionTextChange,
  captionSuggestion = "",
}: QRStyleTabsProps) {
  const { t } = useI18n();
  // Starts on 'transparent' because that is the actual initial background —
  // the swatch grid must never claim a theme the QR isn't wearing.
  const [selectedTheme, setSelectedTheme] = useState("transparent");
  const logoGroup = useRovingRadioGroup<HTMLDivElement>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dismissedBrand, setDismissedBrand] = useState<string | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandLogoError, setBrandLogoError] = useState<string | null>(null);
  /** Untouched source of the centre logo so corner rounding stays reversible. */
  const [logoSource, setLogoSource] = useState<string | null>(logo);
  const [logoRadius, setLogoRadius] = useState(0);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Brand intelligence — only link-like types carry a domain worth reading.
  const linkLikeValue = ["url", "app", "image", "pdf", "mp3"].includes(qrType) ? value : "";
  const brand = useMemo(() => detectBrand(linkLikeValue), [linkLikeValue]);
  const showBrand = Boolean(brand && brand.domain !== dismissedBrand);

  const handleThemeChange = (theme: ThemePreset) => {
    setSelectedTheme(theme.id);
    onFgColorChange(theme.fgColor);
    onBgColorChange(theme.bgColor);
    onBgGradientChange?.(theme.bgGradient || null);
    // A theme is a full preset: colours AND matching pattern. The pattern can
    // still be tweaked afterwards without losing the theme colours.
    if (theme.shape) onBodyShapeChange?.(theme.shape);
  };

  const applyBrandColors = (invert: boolean) => {
    if (!brand) return;
    setSelectedTheme("");
    // Root cause (bug #1, partial merge): only colours change here — pattern,
    // corner style, dots and matrix config are left untouched so "Brand it"
    // never re-initializes the QR matrix.
    const safe = safeBrandPalette(
      invert ? brand.bgColor : brand.fgColor,
      invert ? brand.fgColor : brand.bgColor,
    );
    onFgColorChange(safe.fgColor);
    onBgColorChange(safe.bgColor);
    onBgGradientChange?.(null);
  };

  /** Shape language that matches the brand (rounded, geometric, dotted…). */
  const applyBrandStyle = (shapeKey: BrandApplyOptions["shape"]) => {
    const style = BRAND_SHAPES[shapeKey] ?? brand?.style;
    if (!style) return;
    onBodyShapeChange?.(style.bodyShape as BodyShape);
    onDotStyleChange?.(style.dotStyle as DotType);
    onOuterCornerStyleChange?.(style.outerCornerStyle as CornerSquareType);
    onInnerCornerStyleChange?.(style.innerCornerStyle as CornerDotType);
  };

  const applyBrandLogo = async () => {
    if (!brand) return;
    setBrandBusy(true);
    setBrandLogoError(null);
    // The favicon is inlined first: handing the renderer a URL that 404s or
    // lacks CORS headers is what used to blank the preview.
    const dataUrl = await loadLogoDataUrl(brand.domain);
    setBrandBusy(false);
    if (!dataUrl) {
      setBrandLogoError(
        `Het logo van ${brand.domain} kon niet geladen worden (site blokkeert het of stuurt geen icoon). Kleuren en stijl zijn wel toegepast.`,
      );
      return;
    }
    await setLogoWithRounding(dataUrl);
  };

  /** One entry point for the card: apply exactly what the user ticked. */
  const handleBrandApply = (options: BrandApplyOptions) => {
    if (options.colors) applyBrandColors(options.invert);
    if (options.style) applyBrandStyle(options.shape);
    if (options.logo) void applyBrandLogo();
    else setBrandLogoError(null);
  };

  const clearThemeSelection = () => {
    setSelectedTheme("");
  };

  const handleManualFgColorChange = (color: string) => {
    clearThemeSelection();
    onFgColorChange(color);
  };

  const handleManualBgColorChange = (color: string) => {
    clearThemeSelection();
    onBgColorChange(color);
    onBgGradientChange?.(null);
  };

  /** Live style snapshot used by the preset engine. */
  const currentSnapshot: QrStyleSnapshot = {
    fgColor,
    bgColor,
    bgGradient: bgGradient ?? null,
    bodyShape: bodyShape ?? "square",
    dotStyle: dotStyle ?? "square",
    outerCornerStyle: outerCornerStyle ?? "square",
    innerCornerStyle: innerCornerStyle ?? "square",
    logoSize,
    logoMargin,
    hideBackgroundDots,
    frameId,
    frameLabel,
    frameFont,
    captionEnabled,
    captionText,
  };

  const applyPreset = (style: QrStyleSnapshot) => {
    clearThemeSelection();
    onFgColorChange(style.fgColor);
    onBgColorChange(style.bgColor);
    onBgGradientChange?.(style.bgGradient);
    onBodyShapeChange?.(style.bodyShape as BodyShape);
    onDotStyleChange?.(style.dotStyle as never);
    onOuterCornerStyleChange?.(style.outerCornerStyle as never);
    onInnerCornerStyleChange?.(style.innerCornerStyle as never);
    onLogoSizeChange?.(style.logoSize);
    onLogoMarginChange?.(style.logoMargin);
    onHideBackgroundDotsChange?.(style.hideBackgroundDots);
    onFrameIdChange?.(style.frameId);
    onFrameLabelChange?.(style.frameLabel);
    onFrameFontChange?.(style.frameFont);
    onCaptionEnabledChange?.(style.captionEnabled);
    onCaptionTextChange?.(style.captionText);
  };

  const applyContrastFix = (next: { fgColor: string; bgColor: string }) => {
    clearThemeSelection();
    onFgColorChange(next.fgColor);
    if (next.bgColor !== bgColor) {
      onBgColorChange(next.bgColor);
      onBgGradientChange?.(null);
    }
  };

  /** Store the pristine source, push the rounded derivative to the renderer. */
  const setLogoWithRounding = async (src: string | null, radius = logoRadius) => {
    setLogoSource(src);
    if (!src) {
      onLogoChange(null);
      return;
    }
    onLogoChange(await roundImageDataUrl(src, radius));
  };

  const handleLogoRadiusChange = (radius: number) => {
    setLogoRadius(radius);
    if (logoSource) void setLogoWithRounding(logoSource, radius);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        void setLogoWithRounding(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const inputClassName = "h-12 rounded-xl bg-background border-border input-field";
  const textareaClassName =
    "w-full p-3 rounded-xl bg-background border border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring input-field";

  const renderInputFields = () => {
    switch (qrType) {
      case "url":
        return (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Enter your link here</Label>
            <Input
              type="url"
              placeholder="https://delplanche.com"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className={inputClassName}
            />
            <HelperHint />
          </div>
        );
      case "text":
        return (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Enter your text</Label>
            <textarea
              placeholder="Enter any text content..."
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className={cn(textareaClassName, "h-24")}
            />
          </div>
        );
      case "wifi":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Network Name (SSID)</Label>
              <Input
                type="text"
                placeholder="My WiFi Network"
                value={wifiSSID}
                onChange={(e) => onWifiSSIDChange(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Password</Label>
              <Input
                type="password"
                placeholder="WiFi password"
                value={wifiPassword}
                onChange={(e) => onWifiPasswordChange(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Encryption</Label>
              <div className="flex gap-2">
                {(["WPA", "WEP", "nopass"] as const).map((enc) => (
                  <button
                    key={enc}
                    onClick={() => onWifiEncryptionChange(enc)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      wifiEncryption === enc
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-secondary/80",
                    )}
                  >
                    {enc === "nopass" ? t("style.none") : enc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case "email":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Email Address</Label>
              <Input
                type="email"
                placeholder="hello@delplanche.com"
                value={emailAddress}
                onChange={(e) => onEmailAddressChange(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Subject (optional)</Label>
              <Input
                type="text"
                placeholder="Email subject"
                value={emailSubject}
                onChange={(e) => onEmailSubjectChange(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Body (optional)</Label>
              <textarea
                placeholder="Email body..."
                value={emailBody}
                onChange={(e) => onEmailBodyChange(e.target.value)}
                className={cn(textareaClassName, "h-20")}
              />
            </div>
          </div>
        );
      case "sms":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Phone Number</Label>
              <Input
                type="tel"
                placeholder="+1234567890"
                value={smsPhone}
                onChange={(e) => onSmsPhoneChange(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Message (optional)</Label>
              <textarea
                placeholder="Your message..."
                value={smsMessage}
                onChange={(e) => onSmsMessageChange(e.target.value)}
                className={cn(textareaClassName, "h-20")}
              />
            </div>
          </div>
        );
      case "image":
        return <FileUploadInput type="image" value={value} onValueChange={onValueChange} />;
      case "pdf":
        return <FileUploadInput type="pdf" value={value} onValueChange={onValueChange} />;
      case "mp3":
        return <FileUploadInput type="mp3" value={value} onValueChange={onValueChange} />;
      case "app":
        return (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">App Store or Play Store URL</Label>
            <Input
              type="url"
              placeholder="https://apps.apple.com/... or https://play.google.com/..."
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className={inputClassName}
            />
            <p className="text-sm text-muted-foreground">
              Link to your app on App Store or Google Play
            </p>
          </div>
        );
      default:
        return (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Enter content</Label>
            <Input
              type="text"
              placeholder="Enter content..."
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className={inputClassName}
            />
            <HelperHint />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Style Section */}
      <div className="space-y-6">
        <h2 className="font-display text-[26px] leading-none text-foreground">
          {t("style.heading")}
        </h2>

        {/* Brand intelligence — appears the moment a recognisable domain is typed */}
        {showBrand && brand && (
          <BrandSuggestionCard
            brand={brand}
            busy={brandBusy}
            logoError={brandLogoError}
            onApply={handleBrandApply}
            onDismiss={() => setDismissedBrand(brand.domain)}
          />
        )}

        {/* Theme Presets */}
        <div className="space-y-3 overflow-visible pt-1">
          <p className="text-sm font-medium text-foreground">{t("style.theme")}</p>
          <ThemePresets selectedTheme={selectedTheme} onThemeChange={handleThemeChange} />
        </div>

        {/* Pattern — 1-tap presets inline, advanced axes behind Fine-tune */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("style.pattern")}</p>
          <PatternPresetRow
            selectedShape={bodyShape || "square"}
            onSelect={(shape) => onBodyShapeChange?.(shape)}
            onCustomize={() => setAdvancedOpen(true)}
          />
          <CustomizeShapesModal
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            bodyShape={bodyShape || "square"}
            onBodyShapeChange={(v) => onBodyShapeChange?.(v)}
            dotStyle={dotStyle ?? "square"}
            onDotStyleChange={(v) => onDotStyleChange?.(v)}
            outerCornerStyle={outerCornerStyle ?? "square"}
            onOuterCornerStyleChange={(v) => onOuterCornerStyleChange?.(v)}
            innerCornerStyle={innerCornerStyle ?? "square"}
            onInnerCornerStyleChange={(v) => onInnerCornerStyleChange?.(v)}
            logoSize={logoSize}
            onLogoSizeChange={(v) => onLogoSizeChange?.(v)}
            logoMargin={logoMargin}
            onLogoMarginChange={(v) => onLogoMarginChange?.(v)}
            hideBackgroundDots={hideBackgroundDots}
            onHideBackgroundDotsChange={(v) => onHideBackgroundDotsChange?.(v)}
            hasLogo={Boolean(logo)}
          />
        </div>

        {/* Center Logo */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground" id="center-logo-label">
            {t("style.centerLogo")}
          </p>
          <PickerAnnouncer message={logo ? "Center logo selected" : "No center logo selected"} />

          <div
            role="radiogroup"
            aria-labelledby="center-logo-label"
        tabIndex={-1}
            ref={logoGroup.ref}
            onKeyDown={logoGroup.onKeyDown}
            className="flex items-center gap-2 overflow-visible px-1.5 pt-2.5"
          >
            <button
              type="button"
              onClick={() => void setLogoWithRounding(null)}
              role="radio"
              aria-checked={!logo}
              aria-label={t("style.none")}
              tabIndex={!logo ? 0 : -1}
              className={cn(
                "relative flex-1 h-16 overflow-visible rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !logo ? "border-foreground bg-muted/60" : "border-border hover:bg-secondary",
              )}
            >
              <SelectionIndicator visible={!logo} />
              <NoneGlyph />
              <span>{t("style.none")}</span>
            </button>
            <button
              type="button"
              onClick={() => void setLogoWithRounding(routBunnySrc)}
              title="ROUT bunny"
              role="radio"
              aria-checked={logo === routBunnySrc}
              aria-label="ROUT bunny logo"
              tabIndex={logo === routBunnySrc ? 0 : -1}
              className={cn(
                "relative flex-1 h-16 overflow-visible rounded-xl border-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                logo === routBunnySrc
                  ? "border-foreground bg-muted/60"
                  : "border-border hover:bg-secondary",
              )}
            >
              <SelectionIndicator visible={logo === routBunnySrc} />
              <RoutLogo size={26} showWordmark={false} />
            </button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => logoInputRef.current?.click()}
              aria-label="Upload custom center logo"
              className={cn(
                "relative flex-1 h-16 overflow-visible rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-medium cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                logo && logo !== routBunnySrc
                  ? "border-foreground bg-muted/60"
                  : "border-border hover:bg-secondary",
              )}
            >
              <SelectionIndicator visible={Boolean(logo) && logo !== routBunnySrc} />
              {logo && logo !== routBunnySrc ? (
                <img src={logo} alt="Center logo" className="h-8 w-8 object-contain" />
              ) : (
                <>
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span>{t("style.upload")}</span>
                </>
              )}
            </Button>
            <input ref={logoInputRef} type="file" accept="image/*" aria-label="Upload custom center logo" className="hidden" onChange={handleLogoUpload} />
          </div>

          <p className="text-[11px] text-muted-foreground">{t("style.centerHint")}</p>

          {logo && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-card/50 p-3">
              <LogoSlider
                label="Grootte"
                value={Math.round(logoSize * 100)}
                suffix="%"
                min={15}
                max={50}
                onChange={(v) => onLogoSizeChange?.(v / 100)}
              />
              <LogoSlider
                label="Vrije ruimte"
                value={logoMargin}
                suffix="px"
                min={0}
                max={30}
                onChange={(v) => onLogoMarginChange?.(v)}
              />
              <LogoSlider
                label="Ronde hoeken"
                value={logoRadius}
                suffix="%"
                min={0}
                max={50}
                onChange={handleLogoRadiusChange}
              />
            </div>
          )}
        </div>

        {/* Color Picker */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("style.colors")}</p>
            <ContrastInlineBadge fgColor={fgColor} bgColor={bgColor} onFix={applyContrastFix} />
          </div>
          <ColorPicker
            fgColor={fgColor}
            bgColor={bgColor}
            onFgColorChange={handleManualFgColorChange}
            onBgColorChange={handleManualBgColorChange}
            onBgGradientClear={() => {
              clearThemeSelection();
              onBgGradientChange?.(null);
            }}
          />
        </div>

        {/* Saved style presets */}
        <StylePresets current={currentSnapshot} onApply={applyPreset} />

        {/* Advanced, heavy sections — collapsed by default to keep the panel short */}
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="frames" className="border-border/60">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              {t("style.frame")}
            </AccordionTrigger>
            <AccordionContent>
              <FrameLibrary
                selectedFrameId={frameId}
                onFrameChange={(id) => onFrameIdChange?.(id)}
                frameLabel={frameLabel}
                onFrameLabelChange={(l) => onFrameLabelChange?.(l)}
                frameFont={frameFont}
                frameTweaks={frameTweaks}
                onFrameTweaksChange={(v) => onFrameTweaksChange?.(v)}
                onFrameFontChange={(f) => onFrameFontChange?.(f)}
                fgColor={fgColor}
                bgColor={bgColor}
              />

              {/* Readable short link printed under the code */}
              <div className="mt-4 space-y-3 rounded-xl border border-border/70 bg-card/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Short link onder de QR</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      De QR blijft naar je bestemming wijzen; eronder staat de korte link om over te
                      typen.
                    </p>
                  </div>
                  <Switch
                    checked={captionEnabled}
                    onCheckedChange={(v) => onCaptionEnabledChange?.(v)}
                    aria-label="Short link onder de QR tonen"
                  />
                </div>
                {captionEnabled && (
                  <div className="space-y-1.5">
                    <Input
                      value={captionText}
                      onChange={(e) => onCaptionTextChange?.(e.target.value.slice(0, 42))}
                      placeholder={captionSuggestion || "rout.be/s/abc1234"}
                      className="h-10 font-mono text-xs"
                    />
                    {captionSuggestion && captionSuggestion !== captionText && (
                      <button
                        type="button"
                        onClick={() => onCaptionTextChange?.(captionSuggestion)}
                        className="text-[11px] underline text-muted-foreground hover:text-foreground"
                      >
                        Gebruik {captionSuggestion}
                      </button>
                    )}
                    {!captionSuggestion && (
                      <p className="text-[11px] text-muted-foreground">
                        Maak eerst een short link, of typ zelf een korte tekst.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="export" className="border-border/60">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              {t("style.printSize")}
            </AccordionTrigger>
            <AccordionContent className="space-y-6">
              <DPISelector
                pixelSize={qrSize || 500}
                onPixelSizeChange={(px) => onQrSizeChange?.(px)}
                physicalSize={physicalSize}
                onPhysicalSizeChange={(mm) => onPhysicalSizeChange?.(mm)}
                dpi={dpi}
                onDpiChange={(d) => onDpiChange?.(d)}
                unit={sizeUnit}
                onUnitChange={(u) => onSizeUnitChange?.(u)}
              />

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">{t("style.filename")}</p>
                <FilenameInput
                  value={filename}
                  onChange={(v) => onFilenameChange?.(v)}
                  hint="Used when downloading. No file extension needed."
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-foreground">{t("style.format")}</p>
                  <InfoHint label="About file formats" className="ml-0.5">
                    PNG and JPEG are pixel images sized by the print setting above. SVG is vector
                    output — resolution-independent and ideal for large-format print, so the size
                    setting is ignored.
                  </InfoHint>
                </div>

                <FormatSelector value={qrFormat} onChange={(f) => onQrFormatChange?.(f)} />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">{t("style.margin")}</p>
                <MarginSelector value={qrMargin} onChange={(m) => onQrMarginChange?.(m)} />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
