import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { shouldShowIosInstallHint } from "@/lib/in-app-browser";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "rout_ios_install_dismissed_at";
const DWELL_MS = 25_000;
const SNOOZE_MS = 30 * 24 * 3_600_000;

/**
 * iOS never offers an install prompt, so Safari visitors get a quiet visual
 * guide after they have spent some time on the site: Share → Add to Home Screen.
 */
export function IosInstallHint() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!shouldShowIosInstallHint(navigator.userAgent, Boolean(standalone))) return;
    try {
      const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < SNOOZE_MS) return;
    } catch { /* storage blocked */ }
    const timer = window.setTimeout(() => setShow(true), DWELL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;
  const close = () => {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked */ }
    setShow(false);
  };

  return (
    <div role="dialog" aria-label={t("pages.pwa.ios.title")} className="fixed inset-x-3 bottom-3 z-[60] select-none rounded-3xl border border-border bg-card p-4 text-card-foreground shadow-2xl animate-in slide-in-from-bottom-4 fade-in" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-start gap-3">
        <img src="/logo.svg" alt="" className="h-10 w-10 shrink-0 rounded-2xl bg-background p-1.5 dark:invert" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("pages.pwa.ios.title")}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {t("pages.pwa.ios.tap")} <Share className="h-4 w-4 text-foreground" aria-label={t("pages.pwa.ios.share")} /> {t("pages.pwa.ios.share")}
            <span aria-hidden>➔</span>
            <SquarePlus className="h-4 w-4 text-foreground" aria-hidden /> {t("pages.pwa.ios.add")}
          </p>
        </div>
        <Button variant="ghost" size="icon" type="button" onClick={close} aria-label={t("pages.pwa.ios.dismiss")} className="shrink-0 rounded-full text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
