import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileDown, ImageDown, Nfc, QrCode, Share2, Wallet } from "lucide-react";
import { RoutCardDialog } from "@/components/wallet/RoutCardDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCardPdf, downloadCardPng, type CardInput } from "@/lib/business-card";
import { joinNfcWaitlist } from "@/lib/nfc-waitlist.functions";
import { cn } from "@/lib/utils";
import { DEFAULT_PROFILE_QR_STYLE, type ProfileQrStyle } from "@/lib/profile-qr";
import { renderProfileQr } from "@/lib/profile-qr-render";

type Props = {
  url: string;
  handle: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  /** Shows the NFC teaser (Studio only — needs a signed-in member). */
  showNfc?: boolean;
  /** Saved profile QR style (display_prefs.qrSettings). */
  qrStyle?: ProfileQrStyle | null;
  className?: string;
  style?: React.CSSProperties;
  /** Square icon button (compact action bars). */
  iconOnly?: boolean;
  /** Public visitors only get the QR code and copy link. */
  visitor?: boolean;
};

/** "Deel" menu: copy link, QR, business card (PNG/PDF) and the NFC waitlist teaser. */
export function ShareMenu({ url, handle, name, bio, avatarUrl, showNfc, qrStyle, className, style, iconOnly, visitor }: Props) {
  const { t } = useTranslation();
  const [nfcOpen, setNfcOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const qs = qrStyle ?? DEFAULT_PROFILE_QR_STYLE;
  const [svgSrc, setSvgSrc] = useState("");
  const [pngSrc, setPngSrc] = useState("");
  const styleKey = JSON.stringify(qs);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSvgSrc("");
    setPngSrc("");
    setQrFailed(false);
    renderProfileQr(url, qs)
      .then(({ svg, png }) => {
        if (!cancelled) {
          setSvgSrc(svg);
          setPngSrc(png);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setQrFailed(true);
        toast.error(t("profile.generationFailed"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, styleKey]);

  const qrDataUrl = () => pngSrc;
  const card = (): CardInput => ({ name: name || `@${handle}`, handle, bio: bio ?? "", url, avatarUrl, qrDataUrl: qrDataUrl() });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("profile.linkCopied"));
    } catch {
      toast.error(t("profile.copyFailed"));
    }
  };
  const downloadQr = () => {
    const a = document.createElement("a");
    a.href = svgSrc;
    a.download = `${handle || "rout"}-qr.svg`;
    a.click();
  };
  const downloadQrPng = () => {
    const a = document.createElement("a");
    a.href = qrDataUrl();
    a.download = `${handle || "rout"}-qr.png`;
    a.click();
  };
  // Web NFC (Chrome on Android): write the public profile link onto a blank NFC sticker.
  const [canWriteNfc, setCanWriteNfc] = useState(false);
  useEffect(() => setCanWriteNfc(typeof window !== "undefined" && "NDEFReader" in window), []);
  const writeNfcTag = async () => {
    type Ndef = { write: (msg: { records: { recordType: string; data: string }[] }, opts?: { signal?: AbortSignal }) => Promise<void> };
    const Reader = (window as unknown as { NDEFReader?: new () => Ndef }).NDEFReader;
    if (!Reader) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const id = toast.loading(t("profile.nfcTagHold"));
    try {
      await new Reader().write({ records: [{ recordType: "url", data: url }] }, { signal: ctrl.signal });
      toast.success(t("profile.nfcTagWritten"), { id });
    } catch (e) {
      toast.error(t((e as Error)?.name === "NotAllowedError" ? "profile.nfcTagDenied" : "profile.nfcTagFailed"), { id });
    } finally {
      clearTimeout(timer);
    }
  };
  const run = (fn: () => Promise<void>) => () =>
    void fn().catch(() => toast.error(t("profile.generationFailed")));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-tactile=""
            aria-label={t("profile.shareLabel")}
            title={t("profile.shareLabel")}
            className={cn(iconOnly ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted" : "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition-colors hover:bg-muted", className)}
            style={style}
          >
            <Share2 className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />{iconOnly ? null : <> {t("profile.shareLabel")} </>}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setQrOpen(true)} className="justify-center p-3" aria-label={t("profile.fullscreenQr")}>
            {svgSrc ? <img src={svgSrc} alt={`QR-code voor ${handle}`} className="h-28 w-28 rounded-lg" /> : qrFailed ? <p className="text-xs text-muted-foreground">{t("profile.generationFailed")}</p> : <div className="h-28 w-28 animate-pulse rounded-lg bg-muted" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copy()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden />  {t("profile.copyLink")} </DropdownMenuItem>
          {!visitor && (<>
          <DropdownMenuItem disabled={!pngSrc} onSelect={downloadQrPng}>
            <QrCode className="mr-2 h-4 w-4" aria-hidden />  {t("profile.downloadQr")} </DropdownMenuItem>
          <DropdownMenuItem disabled={!pngSrc} onSelect={run(() => downloadCardPng(card()))}>
            <ImageDown className="mr-2 h-4 w-4" aria-hidden />  {t("profile.cardImage")} </DropdownMenuItem>
          <DropdownMenuItem disabled={!pngSrc} onSelect={run(() => downloadCardPdf(card()))}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden />  {t("profile.cardPdf")} </DropdownMenuItem>
          {handle && (
            <DropdownMenuItem onSelect={() => setWalletOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" aria-hidden /> {t("wallet.add")}
            </DropdownMenuItem>
          )}
          {canWriteNfc && (
            <DropdownMenuItem onSelect={() => void writeNfcTag()}>
              <Nfc className="mr-2 h-4 w-4" aria-hidden /> {t("profile.writeNfcTag")}
            </DropdownMenuItem>
          )}
          </>)}
          {showNfc && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setNfcOpen(true)} className="font-medium">
                <Nfc className="mr-2 h-4 w-4" aria-hidden />  {t("profile.orderNfc")} </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showNfc && <NfcDialog open={nfcOpen} onOpenChange={setNfcOpen} />}
      {handle && !visitor && <RoutCardDialog open={walletOpen} onOpenChange={setWalletOpen} handle={handle} space={/\/u\//.test(url) ? "alias" : "root"} />}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="flex max-h-[100dvh] w-[100vw] max-w-[100vw] flex-col items-center justify-center gap-4 border-0 sm:max-w-[min(90vw,90vh)] sm:rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle> {t("profile.qrCode")} </DialogTitle>
            <DialogDescription> {t("profile.scanProfilePrefix")} {handle}  {t("profile.scanProfileSuffix")} </DialogDescription>
          </DialogHeader>
          {svgSrc && <img src={svgSrc} alt={`QR-code voor ${handle}`} className="aspect-square w-full max-w-[min(90vw,80dvh)] rounded-xl" />}
          <p className="text-sm font-medium">@{handle}</p>
          {!visitor && <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!pngSrc} onClick={downloadQrPng}>PNG</Button>
            <Button type="button" variant="outline" disabled={!svgSrc} onClick={downloadQr}>SVG</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

const MATERIALS = [
  { id: "wood", label: "profile.wood" },
  { id: "metal", label: "profile.metal" },
  { id: "matte_black", label: "profile.matteBlack" },
] as const;

function NfcDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const join = useServerFn(joinNfcWaitlist);
  const [material, setMaterial] = useState<(typeof MATERIALS)[number]["id"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await join({ data: { material } });
      if (r.ok) setDone(true);
      else toast.error(t("profile.saveFailed"));
    } catch {
      toast.error(t("profile.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Nfc className="h-5 w-5" aria-hidden />  {t("profile.nfcCard")} </DialogTitle>
          <DialogDescription>
             {t("profile.nfcComingSoon")} </DialogDescription>
        </DialogHeader>
        {done ? (
          <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm"> {t("profile.waitlisted")} </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("profile.preferredMaterial")}>
              {MATERIALS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={material === m.id}
                  onClick={() => setMaterial(material === m.id ? null : m.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    material === m.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                  )}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>
            <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
               {t("profile.joinWaitlist")} </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
