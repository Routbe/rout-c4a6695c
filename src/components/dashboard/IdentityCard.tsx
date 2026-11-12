import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUrlStyle } from "@/hooks/useUrlStyle";
import { getStudioProfile } from "@/lib/studio-profile.functions";
import {
  canonicalHandle,
  effectiveUrlStyle,
  styledProfileLabel,
  styledProfilePath,
  styledProfileUrl,
  urlStyleForAtPreference,
  urlStyleHasAt,
  type UrlStyle,
} from "@/lib/profile-url";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Identity card — the member's handle in their chosen URL shape, one tap to
 * copy. Every shape resolves to the same profile, so switching here is purely
 * how ROUT presents the link back to them.
 */
export function IdentityCard() {
  const { user } = useAuth();
  const { style, save } = useUrlStyle();
  const getStudioProfileFn = useServerFn(getStudioProfile);
  const [handle, setHandle] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const profile = await getStudioProfileFn();
      if (!alive) return;
      const value = profile?.username;
      setHandle(typeof value === "string" && value ? canonicalHandle(value) : null);
      setVerified(Boolean(profile?.verified) && profile?.status === "active");
    })();
    return () => {
      alive = false;
    };
  }, [user, getStudioProfileFn]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!handle) return null;

  const origin = typeof window === "undefined" ? "https://rout.be" : window.location.origin;
  const label = styledProfileLabel(handle, style);
  const shareUrl = styledProfileUrl(handle, style, origin);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(trI18n.t("ui.ad2a8e95fd"));
    } catch {
      toast.error(trI18n.t("ui.bd5acbff63"), { description: "Select the link and copy it manually." });
    }
  };

  const pick = async (next: UrlStyle) => {
    const { error } = await save(next);
    if (error) toast.error(trI18n.t("ui.6c3e67f7f7"));
  };

  return (
    <section
      aria-label="Your identity"
      className="mb-4 rounded-2xl border border-border bg-card p-3.5 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Your profile link
          </p>
          <p className="mt-1 truncate font-mono text-base sm:text-lg">{label}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copy()}>
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to={styledProfilePath(handle, style)}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {([true, false] as const).map((hasAt) => {
          const option = urlStyleForAtPreference(hasAt);
          return (
            <button
              key={option}
              type="button"
              onClick={() => void pick(option)}
              aria-pressed={hasAt === urlStyleHasAt(style)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                hasAt === urlStyleHasAt(style)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {styledProfileLabel(handle, effectiveUrlStyle(option, verified))}
            </button>
          );
        })}
        <span className="px-1 text-[11px] text-muted-foreground">
          The other shape permanently redirects to your main URL.
        </span>
      </div>
    </section>
  );
}
