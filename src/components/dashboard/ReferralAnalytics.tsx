import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getReferralAnalytics } from "@/lib/monitoring.functions";
import { getMyAccount } from "@/lib/account.functions";
import { fetchUserBadges, type UnlockedBadge } from "@/lib/badges";
import { useI18n } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { logQuietly } from "@/lib/notify";

interface Funnel {
  signups: number;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-xl font-medium leading-none">{value}</p>
    </div>
  );
}

/**
 * Referral analytics: clicks on `rout.be/r/<handle>`, sign-ups that came out of
 * them, the conversion rate, and the badges/entitlements those invites unlocked.
 */
export function ReferralAnalytics() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const fetchFunnel = useServerFn(getReferralAnalytics);
  const loadAccount = useServerFn(getMyAccount);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [badges, setBadges] = useState<UnlockedBadge[]>([]);
  const [entitled, setEntitled] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = (await fetchFunnel()) as Funnel;
        if (!cancelled) setFunnel(data);
      } catch (error) {
        logQuietly("referral-analytics", error);
      }
      try {
        const mine = await fetchUserBadges(user.id);
        if (!cancelled) setBadges(mine);
      } catch (error) {
        logQuietly("referral-badges", error);
      }
      try {
        const account = await loadAccount();
        if (!cancelled) setEntitled(Boolean(account.isPaid || account.isEarlyBeliever));
      } catch {
        /* entitlement chip simply stays hidden */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, fetchFunnel, loadAccount]);

  if (!funnel) return null;

  const referralBadges = badges.filter((b) =>
    ["sharer", "connector", "influencer"].some((slug) => b.slug.includes(slug)),
  );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <BarChart3 className="h-4 w-4" aria-hidden />
        {t("referral.analytics.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("referral.analytics.body")}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Stat
          icon={<UserPlus className="h-3 w-3" aria-hidden />}
          label={t("referral.analytics.signups")}
          value={formatNumber(funnel.signups, locale)}
        />
      </div>

      <div className="rounded-xl border border-border bg-background p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {t("referral.analytics.rewards")}
        </p>
        {referralBadges.length === 0 && !entitled ? (
          <p className="text-xs text-muted-foreground">{t("referral.analytics.noRewards")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {entitled ? (
              <li className="rounded-full border border-foreground/30 px-2.5 py-1 text-[11px] font-medium">
                {t("referral.analytics.entitlementActive")}
              </li>
            ) : null}
            {referralBadges.map((badge) => (
              <li
                key={badge.id}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {badge.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
