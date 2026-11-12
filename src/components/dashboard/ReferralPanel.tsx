import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { INVITE_INTRO, inviteUrl } from "@/lib/invite";
import { getReferralStats } from "@/lib/referral.functions";
import { INVITE_TIERS, nextMilestone, type ReferralReward } from "@/lib/referral-rewards";
import { useI18n } from "@/lib/i18n";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Referral hub — de persoonlijke uitnodigingslink (`rout.be/r/<handle> of /r/u/<alias>`), het
 * aantal aangesloten vrienden en de mijlpalen die daar korting of een badge aan
 * koppelen (3 = 50%, 3 geverifieerd = gratis, 10 = gratis + De Influencer).
 *
 * Gratis leden delen hun alias-namespace (`ref=u_<alias>`), geverifieerde
 * Pro-leden hun schone handle (`ref=<handle>`).
 */
export function ReferralPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [handle, setHandle] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [invited, setInvited] = useState(0);
  const [verifiedInvites, setVerifiedInvites] = useState(0);
  const [reward, setReward] = useState<ReferralReward | null>(null);
  const [copied, setCopied] = useState(false);
  const loadStats = useServerFn(getReferralStats);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void db
      .from("profiles")
      .select("username, verified, status" as "*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as unknown as Record<string, unknown>;
        setHandle(typeof row["username"] === "string" ? row["username"] : null);
        setVerified(Boolean(row["verified"]));
      });

    void loadStats()
      .then((stats) => {
        if (cancelled) return;
        setInvited(stats.invited);
        setVerifiedInvites(stats.verifiedInvites);
        setReward(stats.reward);
      })
      .catch(() => {
        /* stats blijven op nul — de link werkt sowieso */
      });

    return () => {
      cancelled = true;
    };
  }, [user, loadStats]);

  if (!handle) return null;
  const link = inviteUrl(handle, verified);
  const milestone = nextMilestone({ invited, verifiedInvites });
  const progress = milestone ? Math.min(100, Math.round((invited / milestone.goal) * 100)) : 100;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(trI18n.t("ui.7e435785d1"), { description: link });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(trI18n.t("ui.2b98f5f127"));
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url: link, text: INVITE_INTRO, title: t("referral.shareTitle") });
        return;
      } catch {
        /* geannuleerd — val terug op kopiëren */
      }
    }
    void copy();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("referral.title")}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t("referral.count", { count: invited })}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("referral.body")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={link}
          aria-label={t("referral.title")}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 basis-full sm:basis-auto flex-1 px-3 py-2 font-mono text-xs"
        />
        <Button variant="outline"
          type="button"
          onClick={copy}
          className="min-h-10 gap-1.5 px-3 text-sm"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? t("referral.copied") : t("referral.copy")}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={share}
          className="min-h-10 gap-1.5 px-3 text-sm"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t("referral.share")}
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Gift className="h-4 w-4" aria-hidden />
            Beloningen
          </span>
          <span className="text-xs text-muted-foreground">
            {invited} uitgenodigd · {verifiedInvites} geverifieerd
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/70 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {reward?.label ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" aria-hidden />
            {reward.label}
          </p>
        ) : null}
        {milestone ? (
          <p className="text-xs text-muted-foreground">
            Nog {milestone.remaining} {milestone.remaining === 1 ? "vriend" : "vrienden"} voor{" "}
            {milestone.label}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Alle mijlpalen behaald. Bedankt voor het delen.
          </p>
        )}
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>{INVITE_TIERS.halfPrice} uitnodigingen → 50% korting op je verificatie</li>
          <li>{INVITE_TIERS.freeVerified} geverifieerde vrienden → gratis verificatie</li>
          <li>{INVITE_TIERS.influencer} uitnodigingen → gratis + badge “De Influencer”</li>
        </ul>
      </div>
    </section>
  );
}
