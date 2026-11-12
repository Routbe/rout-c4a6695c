import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import { qrGuidePath } from "@/lib/qr-guide-path";
import { Link } from "@/lib/router-compat";
import { TrackingPanel, TrackedQR } from "@/components/TrackingPanel";
import { prettyCaption } from "@/lib/qr-caption";
import { AppLayout } from "@/components/layout/AppLayout";
import { QRPreview } from "@/components/QRPreview";
import { QRTypeSelector, QRType, allQrTypes } from "@/components/QRTypeSelector";
import { QRTypeSheet } from "@/components/QRTypeSheet";
import { useI18n } from "@/lib/i18n";
import { ProfileQrApplyContext, ProfileQrDesignContext, toProfileQrStyle } from "@/lib/qr-design-bridge";
import type { ProfileQrStyle } from "@/lib/profile-qr";
import { getQrSettingsFn } from "@/lib/qr-settings.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";

import { QRStyleTabs, FrameStyle } from "@/components/QRStyleTabs";
import { ProfileShowcase } from "@/components/home/ProfileShowcase";
import { BodyShape } from "@/components/BodyShapeSelector";
import { DEFAULT_FRAME_TWEAKS, type FrameTweaks } from "@/components/QRFrames";

import type { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SaveQRButton } from "@/components/SaveQRButton";
import { mmToPx } from "@/components/DPISelector";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";
import { PAYMENT_METHODS, buildPaymentPayload, isPaymentType } from "@/lib/payments";
import { isRichType, buildRichPayload } from "@/lib/rich-qr";
import { STEAM_QR_STYLE, steamLogoDataUrl } from "@/lib/steam-qr-style";
import { signGoLink } from "@/lib/go-link.functions";
import { suggestFilename } from "@/lib/brand";

import { ValuesSection } from "@/components/ValuesSection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QRCampaignSuggestions } from "@/components/QRCampaignSuggestions";
import { smartLabelSelection } from "@/lib/qr-smart-labels";

const Index = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const loadQrSettings = useServerFn(getQrSettingsFn);
  // QR Type
  const [qrType, setQrType] = useState<QRType>("url");
  // Mobile tier-1 category (desktop sidebar keeps its own state).

  // Separate values for each type
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [imageValue, setImageValue] = useState("");
  const [pdfValue, setPdfValue] = useState("");
  const [mp3Value, setMp3Value] = useState("");
  const [appValue, setAppValue] = useState("");

  // WiFi specific
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiEncryption, setWifiEncryption] = useState<"WPA" | "WEP" | "nopass">("WPA");

  // Email specific
  const [emailAddress, setEmailAddress] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // SMS specific
  const [smsPhone, setSmsPhone] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

  // WhatsApp specific
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");

  // Payment & Checkout — one bag of values per payment network
  const [paymentValues, setPaymentValues] = useState<Record<string, Record<string, string>>>({});
  const activePaymentValues = isPaymentType(qrType) ? (paymentValues[qrType] ?? {}) : {};
  const setPaymentField = (key: string, val: string) =>
    setPaymentValues((prev) => ({
      ...prev,
      [qrType]: { ...(prev[qrType] ?? {}), [key]: val },
    }));

  // Protocol mode: static (hard-coded data) vs dynamic (short link, editable + trackable)
  const [qrMode, setQrMode] = useState<"static" | "dynamic">("static");

  // Styling
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("rounded-md");
  const [fgColor, setFgColor] = useState("#1C1917");
  const [bgColor, setBgColor] = useState("transparent");
  const [bgGradient, setBgGradient] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [bodyShape, setBodyShapeRaw] = useState<BodyShape>("square");
  // Granular style axes (Phase 2). Selecting a Pattern preset snaps all three.
  const [dotStyle, setDotStyle] = useState<DotType>("square");
  const [outerCornerStyle, setOuterCornerStyle] = useState<CornerSquareType>("square");
  const [innerCornerStyle, setInnerCornerStyle] = useState<CornerDotType>("square");
  const [logoSize, setLogoSize] = useState(0.4);
  const [logoMargin, setLogoMargin] = useState(10);
  const [hideBackgroundDots, setHideBackgroundDots] = useState(true);
  const profileQrStyle = useMemo(() => toProfileQrStyle({ fgColor, bgColor, dotStyle, outerCornerStyle, innerCornerStyle, bgGradient, logo, logoSize, logoMargin, hideBackgroundDots }), [fgColor, bgColor, dotStyle, outerCornerStyle, innerCornerStyle, bgGradient, logo, logoSize, logoMargin, hideBackgroundDots]);
  const designKey = JSON.stringify(profileQrStyle);
  const latestDesignKey = useRef(designKey);
  useEffect(() => {
    latestDesignKey.current = designKey;
  }, [designKey]);
  const applySavedStyle = useCallback((style: ProfileQrStyle) => {
    setFgColor(style.fgColor);
    setBgColor(style.bgColor);
    setBgGradient(style.bgGradient ?? null);
    setLogo(style.logo ?? null);
    setDotStyle((style.dotStyle ?? "square") as DotType);
    setOuterCornerStyle((style.outerCornerStyle ?? "square") as CornerSquareType);
    setInnerCornerStyle((style.innerCornerStyle ?? "square") as CornerDotType);
    setLogoSize(style.logoSize ?? 0.4);
    setLogoMargin(style.logoMargin ?? 10);
    setHideBackgroundDots(style.hideBackgroundDots ?? true);
  }, []);
  useEffect(() => {
    if (qrType !== "social" || !user) return;
    let cancelled = false;
    const before = latestDesignKey.current;
    void loadQrSettings().then(style => {
      if (cancelled || !style || before !== latestDesignKey.current) return;
      applySavedStyle(style);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [qrType, user?.id, loadQrSettings]);

  // Steam type: switch to the Steam look once when the type is chosen; members can still restyle.
  useEffect(() => {
    if (qrType !== "steam") return;
    setFgColor(STEAM_QR_STYLE.fgColor);
    setDotStyle(STEAM_QR_STYLE.dotStyle as DotType);
    setLogo(steamLogoDataUrl());
    setLogoSize(STEAM_QR_STYLE.logoSize);
  }, [qrType]);

  const shapePresetMap: Record<
    BodyShape,
    { dot: DotType; outer: CornerSquareType; inner: CornerDotType }
  > = {
    square: { dot: "square", outer: "square", inner: "square" },
    dots: { dot: "dots", outer: "dot", inner: "dot" },
    rounded: { dot: "rounded", outer: "extra-rounded", inner: "dot" },
    classy: { dot: "classy", outer: "extra-rounded", inner: "dot" },
    sharp: { dot: "classy-rounded", outer: "square", inner: "square" },
    calligraphy: { dot: "classy", outer: "extra-rounded", inner: "dot" },
    ballpoint: { dot: "rounded", outer: "square", inner: "square" },
    chalk: { dot: "dots", outer: "extra-rounded", inner: "dot" },
    mesh: { dot: "dots", outer: "extra-rounded", inner: "dot" },
  };

  const setBodyShape = (shape: BodyShape) => {
    setBodyShapeRaw(shape);
    const preset = shapePresetMap[shape];
    setDotStyle(preset.dot);
    setOuterCornerStyle(preset.outer);
    setInnerCornerStyle(preset.inner);
  };
  const [qrSize, setQrSize] = useState(mmToPx(55, 300));
  const [physicalSize, setPhysicalSize] = useState(55);
  const [dpi, setDpi] = useState(300);
  const [sizeUnit, setSizeUnit] = useState<"mm" | "in">("mm");
  const [qrFormat, setQrFormat] = useState<"png" | "svg" | "jpeg">("png");
  const [qrMargin, setQrMargin] = useState(72);
  // Filename follows the content until the user types their own.
  const [filename, setFilename] = useState("qrcode");
  const [filenameTouched, setFilenameTouched] = useState(false);

  // Multi-field types (vCard contact, calendar event) share one value bag.
  const [richValues, setRichValues] = useState<Record<string, Record<string, string>>>({});
  const activeRichValues = richValues[qrType] ?? {};
  const setRichField = (key: string, val: string) =>
    setRichValues((prev) => ({ ...prev, [qrType]: { ...(prev[qrType] ?? {}), [key]: val } }));

  /**
   * Diepe link vanuit Studio: `?type=profile_hub` opent de generator meteen
   * op de profielhub, zodat Studio geen eigen QR-widget hoeft te dupliceren.
   * De Quick Action op de gateway stuurt `?url=…` mee: die start de generator
   * direct met die URL ingevuld.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("type");
    if (requested === "profile_hub" || requested === "social") setQrType("social");
    const option = allQrTypes.find(type => type.id === requested);
    if (option) setQrType(option.id);
    const prefill = params.get("url");
    if (prefill) {
      setQrType("url");
      setUrlValue(prefill);
    }
  }, []);

  const [frameId, setFrameId] = useState<string | null>(null);
  const [frameLabel, setFrameLabel] = useState("");
  const [frameFont, setFrameFont] = useState("sans");
  const [frameTweaks, setFrameTweaks] = useState<FrameTweaks>(DEFAULT_FRAME_TWEAKS);

  // Readable short link printed under the QR (opt-in, editable).
  const [captionEnabled, setCaptionEnabled] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionTouched, setCaptionTouched] = useState(false);

  // Tracking
  const [trackedQr, setTrackedQr] = useState<TrackedQR | null>(null);
  const [smartLabel, setSmartLabel] = useState<ReturnType<typeof smartLabelSelection> | null>(null);

  // Target URL that would be redirected through if tracking is enabled
  const trackableTarget = useMemo(() => {
    switch (qrType) {
      case "feedback":
      case "url":
        return urlValue;
      case "image":
        return imageValue;
      case "pdf":
        return pdfValue;
      case "mp3":
        return mp3Value;
      case "app":
        return appValue;
      default:
        return "";
    }
  }, [qrType, urlValue, imageValue, pdfValue, mp3Value, appValue]);

  // Reset tracked QR when the type changes, or when the underlying target
  // drifts away from the one we minted the short link for.
  useEffect(() => {
    if (!trackedQr) return;
    if (trackedQr.target_type !== qrType || trackedQr.target_url !== trackableTarget) {
      // Only clear when the user actually changed the target after creating it
      const normalized = trackableTarget.trim().replace(/^https?:\/\//i, "");
      const stored = trackedQr.target_url.replace(/^https?:\/\//i, "");
      if (normalized !== stored) setTrackedQr(null);
    }
  }, [qrType, trackableTarget, trackedQr]);

  // Get current value based on type
  const currentValue = useMemo(() => {
    switch (qrType) {
      case "feedback":
      case "url":
        return urlValue;
      case "text":
        return textValue;
      case "image":
        return imageValue;
      case "pdf":
        return pdfValue;
      case "mp3":
        return mp3Value;
      case "app":
        return appValue;
      default:
        return "";
    }
  }, [qrType, urlValue, textValue, imageValue, pdfValue, mp3Value, appValue]);

  // Set value based on current type
  const setCurrentValue = (newValue: string) => {
    switch (qrType) {
      case "feedback":
      case "url":
        setUrlValue(newValue);
        break;
      case "text":
        setTextValue(newValue);
        break;
      case "image":
        setImageValue(newValue);
        break;
      case "pdf":
        setPdfValue(newValue);
        break;
      case "mp3":
        setMp3Value(newValue);
        break;
      case "app":
        setAppValue(newValue);
        break;
    }
  };

  // Generate QR value based on type
  const qrValue = useMemo(() => {
    switch (qrType) {
      case "feedback":
      case "url":
        return urlValue;
      case "text":
        return textValue;
      case "image":
        return imageValue;
      case "pdf":
        return pdfValue;
      case "mp3":
        return mp3Value;
      case "app":
        return appValue;
      case "wifi":
        if (!wifiSSID) return "";
        return `WIFI:T:${wifiEncryption};S:${wifiSSID};P:${wifiPassword};;`;
      case "email": {
        if (!emailAddress) return "";
        let emailStr = `mailto:${emailAddress}`;
        const params: string[] = [];
        if (emailSubject) params.push(`subject=${encodeURIComponent(emailSubject)}`);
        if (emailBody) params.push(`body=${encodeURIComponent(emailBody)}`);
        if (params.length > 0) emailStr += `?${params.join("&")}`;
        return emailStr;
      }
      case "sms": {
        if (!smsPhone) return "";
        let smsStr = `sms:${smsPhone}`;
        if (smsMessage) smsStr += `?body=${encodeURIComponent(smsMessage)}`;
        return smsStr;
      }
      case "whatsapp": {
        if (!whatsappPhone) return "";
        const digits = whatsappPhone.replace(/[^\d]/g, "");
        if (!digits) return "";
        let wa = `https://wa.me/${digits}`;
        if (whatsappMessage) wa += `?text=${encodeURIComponent(whatsappMessage)}`;
        return wa;
      }
      default:
        if (isRichType(qrType)) return buildRichPayload(qrType, activeRichValues);
        if (isPaymentType(qrType)) return buildPaymentPayload(qrType, activePaymentValues);
        return "";
    }
  }, [
    qrType,
    activePaymentValues,
    activeRichValues,
    urlValue,
    textValue,
    imageValue,
    pdfValue,
    mp3Value,
    appValue,
    wifiSSID,
    wifiPassword,
    wifiEncryption,
    emailAddress,
    emailSubject,
    emailBody,
    smsPhone,
    smsMessage,
    whatsappPhone,
    whatsappMessage,
  ]);

  // Final value encoded in the QR — swap in the short link when tracking is on (dynamic mode).
  // Sign /go app links on the server so the router page trusts them.
  const [signedGo, setSignedGo] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (!qrValue || !qrValue.includes("/go?")) return;
    let cancelled = false;
    try {
      const u = new URL(qrValue);
      const p = u.searchParams;
      void signGoLink({ data: { i: p.get("i") ?? undefined, a: p.get("a") ?? undefined, w: p.get("w") ?? undefined } })
        .then((r) => {
          if (cancelled || !r.sig) return;
          p.set("s", r.sig);
          setSignedGo({ from: qrValue, to: u.toString() });
        })
        .catch(() => {});
    } catch {
      /* not a URL */
    }
    return () => {
      cancelled = true;
    };
  }, [qrValue]);

  const finalQrValue = useMemo(() => {
    if (qrMode === "dynamic" && trackedQr && trackedQr.target_type === qrType)
      return trackedQr.redirect_url;
    if (signedGo && signedGo.from === qrValue) return signedGo.to;
    return qrValue;
  }, [qrMode, trackedQr, qrType, qrValue, signedGo]);
  const activeSmartLabel = smartLabel?.destination === currentValue ? smartLabel : null;

  // Clear any minted tracked link when user switches back to Static mode.
  useEffect(() => {
    if (qrMode === "static" && trackedQr) setTrackedQr(null);
  }, [qrMode, trackedQr]);

  // Auto-name the download after the content (delplanche-com-qr, wifi-office-qr, …)
  // until the user overrides it in the Filename field.
  const suggestedFilename = useMemo(
    () =>
      suggestFilename({
        qrType,
        url: currentValue,
        text: textValue,
        wifiSSID,
        emailAddress,
        smsPhone,
        whatsappPhone,
        paymentLabel: PAYMENT_METHODS.find((m) => m.id === qrType)?.label,
      }),
    [qrType, currentValue, textValue, wifiSSID, emailAddress, smsPhone, whatsappPhone],
  );

  useEffect(() => {
    if (!filenameTouched) setFilename(suggestedFilename);
  }, [suggestedFilename, filenameTouched]);

  /** The active short link, stripped for display use. */
  const captionSuggestion = trackedQr ? prettyCaption(trackedQr.redirect_url) : "";

  // Follow the freshly minted short link until the user types their own text.
  useEffect(() => {
    if (!captionTouched && captionSuggestion) setCaptionText(captionSuggestion);
  }, [captionSuggestion, captionTouched]);

  const handleCaptionTextChange = (v: string) => {
    setCaptionTouched(true);
    setCaptionText(v);
  };

  const handleFilenameChange = (v: string) => {
    setFilenameTouched(v.trim().length > 0);
    setFilename(v);
  };

  return (
    <ProfileQrDesignContext.Provider value={profileQrStyle}>
    <ProfileQrApplyContext.Provider value={applySavedStyle}>
    <AppLayout width="full" trustBadges>
      {/* Desktop app-shell: a strict 3-column grid so no pane can overlap another. */}
      <div className="grid w-full max-w-full grid-cols-1 overflow-x-hidden lg:h-[calc(100vh-4rem)] lg:grid-cols-[320px_minmax(0,1fr)_340px] lg:overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)_400px]">
        {/* Left column — QR type selector */}
        <aside className="hidden min-w-0 border-r border-border/60 bg-background pl-4 pr-2 pt-8 lg:block lg:h-full lg:overflow-hidden">
          <ScrollArea className="h-[calc(100vh-6rem)] pr-2">
            <QRTypeSelector selectedType={qrType} onTypeChange={setQrType} />
          </ScrollArea>
        </aside>

        {/* Mobile QR Type Selector — bottom sheet with search */}
        <div className="min-w-0 border-b border-border bg-background p-4 lg:hidden">
          <h2 className="font-display text-[26px] leading-none text-foreground mb-3">
            {t("type.heading")}
          </h2>
          <QRTypeSheet selectedType={qrType} onTypeChange={setQrType} />
        </div>

        {/* Center column — the QR preview card stays centred inside its own cell */}
        <main className="flex min-w-0 flex-col items-center px-4 pb-8 pt-4 sm:px-6 lg:h-full lg:overflow-y-auto lg:pt-6 [scrollbar-width:thin]">
          <div
            className="preview-sheet mx-auto w-full max-w-sm py-2"
          >
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-[26px] leading-none text-foreground sketch-underline">
                {t("preview.title")}
              </h2>
              <span className="eyebrow">Nº 01</span>
            </div>
            <ErrorBoundary label="QR Generator" inline>
              <QRPreview
                qrType={qrType}
                value={currentValue}
                onValueChange={setCurrentValue}
                wifiSSID={wifiSSID}
                onWifiSSIDChange={setWifiSSID}
                wifiPassword={wifiPassword}
                onWifiPasswordChange={setWifiPassword}
                wifiEncryption={wifiEncryption}
                onWifiEncryptionChange={setWifiEncryption}
                emailAddress={emailAddress}
                onEmailAddressChange={setEmailAddress}
                emailSubject={emailSubject}
                onEmailSubjectChange={setEmailSubject}
                emailBody={emailBody}
                onEmailBodyChange={setEmailBody}
                smsPhone={smsPhone}
                onSmsPhoneChange={setSmsPhone}
                smsMessage={smsMessage}
                onSmsMessageChange={setSmsMessage}
                whatsappPhone={whatsappPhone}
                onWhatsappPhoneChange={setWhatsappPhone}
                whatsappMessage={whatsappMessage}
                onWhatsappMessageChange={setWhatsappMessage}
                paymentValues={activePaymentValues}
                onPaymentFieldChange={setPaymentField}
                richValues={activeRichValues}
                onRichFieldChange={setRichField}
                qrValue={finalQrValue}
                fgColor={fgColor}
                bgColor={bgColor}
                bgGradient={bgGradient}
                frameStyle={frameStyle}
                logo={logo}
                bodyShape={bodyShape}
                dotStyle={dotStyle}
                outerCornerStyle={outerCornerStyle}
                innerCornerStyle={innerCornerStyle}
                logoSize={logoSize}
                logoMargin={logoMargin}
                hideBackgroundDots={hideBackgroundDots}
                downloadSize={qrSize}
                downloadFormat={qrFormat}
                downloadMargin={qrMargin}
                filename={filename}
                frameId={frameId}
                frameLabel={frameLabel}
                frameFont={frameFont}
                frameTweaks={frameTweaks}
                captionEnabled={captionEnabled}
                captionText={captionText}
                printMm={sizeUnit === "in" ? Math.round(physicalSize * 25.4) : physicalSize}
                onAutoFixContrast={() => {
                  // Snap to a guaranteed-safe pair (21:1) before exporting.
                  setFgColor("#000000");
                  setBgColor("#FFFFFF");
                  setBgGradient(null);
                }}
              />
            </ErrorBoundary>
          </div>

          <div className="w-full max-w-md mt-4 flex justify-end">
            <SaveQRButton
              qrType={qrType}
              qrValue={finalQrValue}
              nameHint={activeSmartLabel?.label}
              disabled={!qrValue}
              config={{
                fgColor,
                bgColor,
                bgGradient,
                frameStyle,
                bodyShape,
                qrSize,
                qrFormat,
                qrMargin,
                frameId, frameLabel, frameFont, frameTweaks, captionEnabled, captionText,
                ...(activeSmartLabel ? { smartLabel: activeSmartLabel } : {}),
              }}
            />
          </div>

          <div className="w-full max-w-md mt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="eyebrow">Protocol</span>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
                  {(["static", "dynamic"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setQrMode(m)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-medium tracking-wide uppercase transition-colors",
                        qrMode === m
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`protocol.${m}`)}
                    </button>
                  ))}
                </div>
                <InfoHint label="About static and dynamic codes">
                  {t("protocol.staticHint")} {t("protocol.dynamicHint")}
                </InfoHint>
              </div>
            </div>
            <DocHelpLink to="/guide/dynamic-qr">Lees hoe dit werkt</DocHelpLink>
            {qrGuidePath(qrType) && <div className="mt-2"><DocHelpLink to={qrGuidePath(qrType) ?? "/qr-code-generator"}>Hoe werkt deze QR-code?</DocHelpLink></div>}
          </div>

          {qrMode === "static" && (
            <div className="w-full max-w-md mt-4">
              <button
                type="button"
                onClick={() => setQrMode("dynamic")}
                className="w-full rounded-2xl border border-dashed border-border bg-card/60 p-4 text-left transition-colors hover:bg-card"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Link2 className="h-4 w-4" /> {t("home.shortlink.cta.title")}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("home.shortlink.cta.description")}
                </span>
              </button>
            </div>
          )}

          {qrMode === "dynamic" && (
            <div className="w-full max-w-md mt-4">
              <TrackingPanel
                qrType={qrType}
                targetUrl={trackableTarget}
                tracked={trackedQr}
                onTrackedChange={setTrackedQr}
                suggestedLabel={activeSmartLabel?.label}
              />
            </div>
          )}
        </main>

        {/* Right column — styling tools (independent scroll on desktop) */}
        <aside className="min-w-0 border-t border-border/60 bg-background px-4 pb-8 pt-6 sm:px-6 lg:h-full lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-6 lg:pt-8 [scrollbar-width:thin]">
          <QRCampaignSuggestions destination={urlValue} onApply={(url, label, cta) => {
            const accepted = smartLabelSelection({ destination: url, label, callToAction: cta });
            setSmartLabel(accepted); setTrackedQr(null); setQrType("url"); setUrlValue(accepted.destination);
            handleFilenameChange(accepted.label); setFrameLabel(accepted.callToAction);
            setCaptionEnabled(true); setCaptionTouched(true); setCaptionText(accepted.callToAction);
          }} />
          <QRStyleTabs
            qrType={qrType}
            value={currentValue}
            onValueChange={setCurrentValue}
            wifiSSID={wifiSSID}
            onWifiSSIDChange={setWifiSSID}
            wifiPassword={wifiPassword}
            onWifiPasswordChange={setWifiPassword}
            wifiEncryption={wifiEncryption}
            onWifiEncryptionChange={setWifiEncryption}
            emailAddress={emailAddress}
            onEmailAddressChange={setEmailAddress}
            emailSubject={emailSubject}
            onEmailSubjectChange={setEmailSubject}
            emailBody={emailBody}
            onEmailBodyChange={setEmailBody}
            smsPhone={smsPhone}
            onSmsPhoneChange={setSmsPhone}
            smsMessage={smsMessage}
            onSmsMessageChange={setSmsMessage}
            frameStyle={frameStyle}
            onFrameStyleChange={setFrameStyle}
            fgColor={fgColor}
            onFgColorChange={setFgColor}
            bgColor={bgColor}
            onBgColorChange={setBgColor}
            bgGradient={bgGradient}
            onBgGradientChange={setBgGradient}
            logo={logo}
            onLogoChange={setLogo}
            bodyShape={bodyShape}
            onBodyShapeChange={setBodyShape}
            qrSize={qrSize}
            onQrSizeChange={setQrSize}
            physicalSize={physicalSize}
            onPhysicalSizeChange={setPhysicalSize}
            dpi={dpi}
            onDpiChange={setDpi}
            sizeUnit={sizeUnit}
            onSizeUnitChange={setSizeUnit}
            qrFormat={qrFormat}
            onQrFormatChange={setQrFormat}
            qrMargin={qrMargin}
            onQrMarginChange={setQrMargin}
            filename={filename}
            onFilenameChange={handleFilenameChange}
            dotStyle={dotStyle}
            onDotStyleChange={setDotStyle}
            outerCornerStyle={outerCornerStyle}
            onOuterCornerStyleChange={setOuterCornerStyle}
            innerCornerStyle={innerCornerStyle}
            onInnerCornerStyleChange={setInnerCornerStyle}
            logoSize={logoSize}
            onLogoSizeChange={setLogoSize}
            logoMargin={logoMargin}
            onLogoMarginChange={setLogoMargin}
            hideBackgroundDots={hideBackgroundDots}
            onHideBackgroundDotsChange={setHideBackgroundDots}
            frameId={frameId}
            onFrameIdChange={setFrameId}
            frameLabel={frameLabel}
            onFrameLabelChange={setFrameLabel}
            frameFont={frameFont}
            onFrameFontChange={setFrameFont}
            frameTweaks={frameTweaks}
            onFrameTweaksChange={setFrameTweaks}
          />
        </aside>
      </div>

      <ProfileShowcase />

      <section className="mx-auto mt-10 max-w-2xl px-4 text-center">
        <p className="text-sm text-muted-foreground">{t("tour.cta.title")}</p>
        <Button asChild size="lg" variant="outline" className="mt-3"><Link to="/tour">
          {t("tour.cta.button")}
        </Link></Button>
      </section>

      <ValuesSection />
    </AppLayout>
    </ProfileQrApplyContext.Provider>
    </ProfileQrDesignContext.Provider>
  );
};

export default Index;
