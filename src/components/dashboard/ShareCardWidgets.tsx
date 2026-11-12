import { useEffect, useState } from "react";
import { renderStoryCard } from "@/lib/qa/story-card";
import { storyFile, supportsStoryShare } from "@/lib/qa/native-share";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, Check, Copy, Globe, HandCoins, Heart, MessageCircleQuestion, Radio, Share2, Wallet, ArrowUpRight, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyCardSecurity } from "@/lib/wallet/wallet.functions";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { RoutCardDialog } from "@/components/wallet/RoutCardDialog";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { enableMyAskPage, getQaPublic } from "@/lib/questions.functions";
import { AppBrandTile } from "@/components/brand/AppBrandTile";
import { snapchatAttachUrl, whatsappTextUrl } from "@/lib/share-links";

export const SHARE_TARGETS = [
  { id: "hub", path: "", icon: Globe },
  { id: "ask", path: "/ask", icon: MessageCircleQuestion },
  { id: "donate", path: "/donate", icon: Heart },
  { id: "tip", path: "/tip", icon: HandCoins },
  { id: "booking", path: "/booking", icon: CalendarDays },
  { id: "live", path: "/live", icon: Radio },
] as const;
export type ShareTargetId = (typeof SHARE_TARGETS)[number]["id"];

export function shareTargetUrl(origin: string, handle: string, id: ShareTargetId): string {
  const target = SHARE_TARGETS.find((t) => t.id === id) ?? SHARE_TARGETS[0];
  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(handle)}${target.path}`;
}

type Platform = "snapchat" | "instagram" | "whatsapp" | "more";
const PLATFORMS: Platform[] = ["snapchat", "instagram", "whatsapp", "more"];
const GUIDE_KEY = "rout.shareGuideSeen.";

/** Pick one public page, then share it as a story image with a tappable link. */
export function ShareWidget({ handle }: { handle: string | null | undefined }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ShareTargetId>("hub");
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [guide, setGuide] = useState<Platform | null>(null);
  const [step, setStep] = useState(0);
  const url = handle && typeof window !== "undefined" ? shareTargetUrl(window.location.origin, handle, selected) : "";

  // Render the story image ahead of time so the OS share stays inside the user's tap.
  useEffect(() => {
    if (!handle || !url) return;
    let live = true;
    setFile(null);
    renderStoryCard({ kind: "prompt", prompt: t(`shareWidget.story.${selected}`), handle, displayName: null, avatarSrc: null, hint: t("shareWidget.storyHint"), sendMe: t(`shareWidget.${selected}`), link: url.replace(/^https?:\/\//, "") })
      .then((b) => { if (live) setFile(storyFile(b, `rout-${selected}.png`)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [handle, url, selected, t]);

  // Know ahead of the tap whether the anonymous ask page is live, so the share sheet still opens inside the tap.
  const [askOn, setAskOn] = useState<boolean | null>(null);
  const [askPrompt, setAskPrompt] = useState<Platform | null>(null);
  const [enabling, setEnabling] = useState(false);
  useEffect(() => {
    if (!handle) return;
    let live = true;
    getQaPublic({ data: { handle, space: "root" } })
      .then(({ qa }) => { if (live) setAskOn(Boolean(qa?.accepting)); })
      .catch(() => { if (live) setAskOn(null); });
    return () => { live = false; };
  }, [handle]);
  const turnOnAsk = async () => {
    setEnabling(true);
    try {
      await enableMyAskPage();
      setAskOn(true);
      toast.success(t("shareWidget.askOff.done", { defaultValue: "Je anonieme vragenpagina staat aan." }));
    } catch {
      toast.error(t("shareWidget.askOff.failed", { defaultValue: "Aanzetten lukte niet. Probeer opnieuw." }));
    } finally { setEnabling(false); }
  };

  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const copyLink = async (silent = false) => {
    try { await navigator.clipboard.writeText(url); } catch { return; }
    setCopied(true);
    if (!silent) toast.success(t("shareWidget.copied"));
    window.setTimeout(() => setCopied(false), 1600);
  };
  const download = () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  // navigator.share must start inside the tap: never await anything before it.
  const shareImage = async (withText: boolean): Promise<boolean> => {
    if (file && supportsStoryShare(file)) {
      try {
        await navigator.share(withText ? { files: [file], text: `${t(`shareWidget.story.${selected}`)} ${url}` } : { files: [file] });
        return true;
      } catch (e) { if ((e as Error).name === "AbortError") return true; }
    }
    return false;
  };
  const run = (p: Platform) => {
    const message = `${t(`shareWidget.story.${selected}`)} ${url}`;
    // Snapchat opens its camera with the link already attached; WhatsApp opens with the message filled in.
    if (p === "snapchat") {
      void copyLink(true);
      window.open(snapchatAttachUrl(url), "_blank", "noopener,noreferrer");
      return;
    }
    if (p === "whatsapp") {
      window.open(whatsappTextUrl(message), "_blank", "noopener,noreferrer");
      return;
    }
    if (p === "instagram") {
      // Instagram has no way to pre-fill a link: the link goes on the clipboard for the Link sticker.
      void copyLink(true);
      void shareImage(false).then((ok) => {
        if (ok) return;
        // Desktop / no file sharing: save the image and keep the link on the clipboard.
        download();
        toast.success(t("shareWidget.linkReady"));
      });
      return;
    }
    void shareImage(true).then(async (ok) => {
      if (ok) return;
      if (navigator.share) { try { await navigator.share({ url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
      await copyLink();
      download();
    });
  };
  const pick = (p: Platform) => {
    if (selected === "ask" && askOn === false) { setAskPrompt(p); return; }
    if (p === "instagram" && !localStorage.getItem(GUIDE_KEY + p)) { setStep(0); setGuide(p); return; }
    run(p);
  };
  const steps = guide ? (t(`shareWidget.guide.${guide}.steps`, { returnObjects: true }) as string[]) : [];
  const finishGuide = () => {
    if (!guide) return;
    localStorage.setItem(GUIDE_KEY + guide, "1");
    const p = guide; setGuide(null); run(p);
  };

  return (
    <section className="acrylic-card flex min-w-0 flex-col gap-4 p-5" aria-labelledby="share-widget-title">
      <h2 id="share-widget-title" className="font-display text-2xl leading-tight">{t("shareWidget.title")}</h2>
      {handle ? (
        <>
          <div role="radiogroup" aria-label={t("shareWidget.title")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SHARE_TARGETS.map(({ id, icon: Icon }) => {
              const active = id === selected;
              return (
                <button key={id} type="button" role="radio" aria-checked={active} onClick={() => setSelected(id)}
                  className={cn("flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    active ? "border-foreground bg-foreground text-background" : "border-border bg-background/40 text-foreground hover:border-foreground/40")}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{t(`shareWidget.${id}`)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 py-1 pl-3 pr-1">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={url}>{url.replace(/^https?:\/\//, "")}</p>
            <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => void copyLink()} aria-label={t("shareWidget.copy")}>
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2" aria-label={t("shareWidget.shareTo")}>
            {PLATFORMS.map((p) => (
              <button key={p} type="button" data-tactile="" onClick={() => pick(p)} disabled={(p === "instagram" || p === "more") && !file}
                className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-background/40 px-1 py-2 text-xs transition-colors hover:border-foreground/40 disabled:opacity-50">
                {p === "more"
                  ? <span className="grid size-9 place-items-center rounded-[28%] bg-foreground text-background" aria-hidden><Share2 className="h-[18px] w-[18px]" /></span>
                  : <AppBrandTile brand={p} />}
                <span className="max-w-full truncate">{t(`shareWidget.platform.${p}`)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("shareWidget.tappableNote")}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("shareWidget.noHandle")}</p>
      )}
      <Dialog open={askPrompt !== null} onOpenChange={(o) => { if (!o) setAskPrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="font-display text-xl">{t("shareWidget.askOff.title", { defaultValue: "Je vragenpagina staat uit" })}</DialogTitle>
          <DialogDescription>{t("shareWidget.askOff.body", { defaultValue: "Wie op je link tikt, kan je nu nog geen anoniem bericht sturen. Zet de pagina aan om te delen." })}</DialogDescription>
          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border px-4">
            <span className="text-sm font-medium">{t("shareWidget.askOff.toggle", { defaultValue: "Anonieme vragenpagina" })}</span>
            <Switch checked={askOn === true} disabled={enabling || askOn === true} onCheckedChange={(v) => { if (v) void turnOnAsk(); }} />
          </label>
          <Button type="button" className="min-h-12 w-full" disabled={askOn !== true}
            onClick={() => { const p = askPrompt; setAskPrompt(null); if (p) pick(p); }}>
            {t("shareWidget.askOff.share", { defaultValue: "Nu delen" })}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={guide !== null} onOpenChange={(o) => { if (!o) setGuide(null); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-center font-display text-xl">{guide ? t(`shareWidget.guide.${guide}.title`) : ""}</DialogTitle>
          <DialogDescription className="sr-only">{t("shareWidget.tappableNote")}</DialogDescription>
          <div className="flex justify-center gap-2" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn("grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition-colors", i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{i + 1}</span>
            ))}
          </div>
          {guide ? <GuideDemo platform={guide} step={step} preview={preview} /> : null}
          <p className="min-h-12 text-center text-base font-medium" aria-live="polite">{steps[step]}</p>
          <Button type="button" className="min-h-12 w-full" onClick={() => (step < steps.length - 1 ? setStep(step + 1) : finishGuide())}>
            {step < steps.length - 1 ? t("shareWidget.guide.next") : t("shareWidget.guide.go")}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Looping mini-phone animation per guide step — a lightweight stand-in for a video clip. */
function GuideDemo({ platform, step, preview }: { platform: Platform; step: number; preview: string | null }) {
  const snap = platform === "snapchat";
  const tools = snap ? ["T", "✎", "📎", "✂"] : ["Aa", "☺", "▣", "✦"];
  const hot = step === 1 ? 2 : -1;
  return (
    <div key={`${platform}-${step}`} className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-muted/60 animate-in fade-in duration-300" aria-hidden>
      <div className="relative h-[88%] aspect-[9/16] overflow-hidden rounded-[1.1rem] border-4 border-foreground bg-background shadow-lg">
        {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {step === 0 ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-around rounded-t-xl bg-card/95 p-2 animate-in slide-in-from-bottom duration-500">
            {["👻", "◎", "✆"].map((s, i) => (
              <span key={s} className={cn("grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px]", (snap ? i === 0 : i === 1) && "ring-2 ring-foreground animate-pulse")}>{s}</span>
            ))}
          </div>
        ) : null}
        {step >= 1 ? (
          <div className={cn("absolute flex gap-1", snap ? "right-1 top-2 flex-col" : "inset-x-0 top-1 justify-center")}>
            {tools.map((s, i) => (
              <span key={s} className={cn("grid h-5 w-5 place-items-center rounded-full bg-background/80 text-[9px] font-semibold", i === hot && "ring-2 ring-foreground animate-pulse")}>{s}</span>
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="absolute inset-x-2 top-1/3 rounded-lg bg-card p-1.5 text-center text-[8px] font-mono shadow animate-in zoom-in-90 duration-500">
            {snap ? "📎 " : "🔗 "}rout.link/…
            <div className="mt-1 rounded bg-foreground py-0.5 text-[8px] text-background animate-pulse">{snap ? "Attach" : "Done"}</div>
          </div>
        ) : null}
        {step === 3 ? (
          <>
            <span className="absolute left-1/2 top-[62%] -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[8px] text-background shadow animate-in zoom-in duration-500">🔗 rout.link</span>
            <span className="absolute left-1/2 top-[62%] h-6 w-6 -translate-x-1/2 animate-ping rounded-full bg-foreground/30" />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** ROUT card status at a glance: state, last 4 digits, 2FA warning and quick actions. */
export function CardWidget({ handle }: { handle: string | null | undefined }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const loadSec = useServerFn(getMyCardSecurity);
  const [sec, setSec] = useState<Awaited<ReturnType<typeof getMyCardSecurity>> | null>(null);
  useEffect(() => { if (handle) loadSec().then(setSec).catch(() => setSec(null)); }, [handle, loadSec, open]);
  const state = sec?.state;
  const label = state === "active" ? t("cardWidget.statusActive") : state === "frozen" ? t("cardWidget.statusFrozen") : state === "blocked" ? t("cardWidget.statusBlocked") : t("cardWidget.statusNone");
  return (
    <section className="acrylic-card flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="flex items-center gap-2"><Wallet className="h-3.5 w-3.5" aria-hidden /> {t("cardWidget.eyebrow")}</span>
        <span className={state === "active" ? "text-primary" : state ? "text-destructive" : ""}>{label}</span>
      </div>
      <div>
        <p className="font-display text-2xl leading-tight">{t("cardWidget.title")}</p>
        <p className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">{sec?.cardNumber ? `•••• •••• ${sec.cardNumber.slice(-4)}` : handle ? t("cardWidget.hint") : t("walletPage.noHandle")}</p>
      </div>
      {sec && !sec.twoFactor && (
        <Link to="/studio/account" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden /> {t("cardWidget.enable2fa")}</Link>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!handle} onClick={() => setOpen(true)} className="gap-1.5"><QrCode className="h-3.5 w-3.5" aria-hidden /> {t("cardWidget.cardAndQr")}</Button>
        <Button asChild size="sm" variant={state === "active" ? "destructive" : "outline"} className="gap-1.5"><Link to="/wallet"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {state === "active" ? t("cardWidget.block") : t("cardWidget.manage")}</Link></Button>
      </div>
      {handle ? <RoutCardDialog open={open} onOpenChange={setOpen} handle={handle} /> : null}
    </section>
  );
}
