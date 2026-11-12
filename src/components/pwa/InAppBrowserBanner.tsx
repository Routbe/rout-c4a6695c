import { useEffect, useState } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { isInAppBrowser, systemBrowserUrl } from "@/lib/in-app-browser";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "rout_inapp_banner_dismissed";

export function InAppBrowserBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!isInAppBrowser(ua)) return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch { /* private mode */ }
    setIntent(systemBrowserUrl(window.location.href, ua));
    setShow(true);
  }, []);

  if (!show) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("inAppBrowser.copied"));
    } catch {
      toast.error(t("inAppBrowser.copyFailed"));
    }
  };
  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setShow(false);
  };

  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] select-none border-b border-border bg-foreground pt-[env(safe-area-inset-top)] text-background">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 text-xs">
        <p className="min-w-0 flex-1 leading-snug">{t("inAppBrowser.message")}</p>
        {intent ? (
          <a href={intent} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background px-3 py-1.5 font-medium text-foreground">
            <ExternalLink className="h-3.5 w-3.5" /> {t("inAppBrowser.open")}
          </a>
        ) : (
          <Button variant="ghost" size="sm" type="button" onClick={() => void copy()} className="shrink-0 gap-1 rounded-full bg-background font-medium text-foreground">
            <Copy className="h-3.5 w-3.5" /> {t("inAppBrowser.copy")}
          </Button>
        )}
        <Button variant="ghost" size="icon" type="button" onClick={close} aria-label={t("inAppBrowser.dismiss")} className="h-7 w-7 shrink-0 rounded-full p-1 opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
