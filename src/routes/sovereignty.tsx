import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { canonicalLink, canonicalMeta, socialImageMeta } from "@/lib/site";
import { LegalPage } from "@/components/LegalPage";
import { LegalChips, type LegalChip } from "@/components/LegalChips";
import { LegalActionBar } from "@/components/LegalActionBar";
import { TrustSealGrid } from "@/components/ui/trust-badges";
import { Trans } from "react-i18next";
import { useI18n } from "@/lib/i18n";
import { Cpu, Globe, KeyRound, Scale, ShieldCheck } from "lucide-react";

const CHIPS = [
  ["client-side", "local"], ["eea", "eea"], ["identity", "idp"], ["agpl", "oss"], ["badges", "badges"],
] as const;

const sectionWrapper = "mb-6 scroll-mt-24 rounded-xl border border-border/50 bg-card p-5 shadow-sm";
const bodyText = "text-sm leading-relaxed text-foreground/80";
const listClass = "space-y-2 pl-4 text-sm leading-relaxed text-foreground/80 [&>li]:list-disc";
const strong = "font-medium text-foreground";
const badgeClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground";

const K = "pages.sovereignty.";
const TAGS = { s: <span className={strong} />, m: <span className="font-mono text-xs" /> };
const Rich = ({ k }: { k: string }) => <Trans i18nKey={K + k} components={TAGS} />;

function numbered(n: string, text: string) {
  return (
    <h2 className="font-serif text-lg font-semibold text-foreground">
      <span className="mr-2 font-mono text-xs text-muted-foreground">{n}.</span>
      {text}
    </h2>
  );
}

function SovereigntyPage() {
  const { t: tr } = useI18n();
  const t = (k: string) => tr(K + k);
  const chips: LegalChip[] = CHIPS.map(([id, k]) => ({ id, label: t(`chip.${k}`) }));
  return (
    <LegalPage
      title={t("title")}
      updated={t("updated")}
      card
      subtitle={
        <div className="my-3 flex flex-wrap items-center gap-2">
          <span className={badgeClass}><Cpu className="size-3.5" aria-hidden /> {t("badge.local")}</span>
          <span className={badgeClass}><Globe className="size-3.5" aria-hidden /> {t("badge.eea")}</span>
          <span className={badgeClass}><KeyRound className="size-3.5" aria-hidden /> {t("badge.passkeys")}</span>
          <span className={badgeClass}><Scale className="size-3.5" aria-hidden /> {t("badge.agpl")}</span>
        </div>
      }
      quickJump={<LegalChips chips={chips} />}
      sections={[
        {
          id: "client-side",
          heading: (
            <h2 className="flex items-start gap-2 font-serif text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="mr-2 font-mono text-xs text-muted-foreground">01.</span>
                {t("s1.title")}
              </span>
            </h2>
          ),
          wrapperClassName:
            "my-6 scroll-mt-24 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-5 dark:bg-emerald-500/10",
          body: (
            <>
              <p className={bodyText}>{t("s1.p1")}</p>
              <p className={bodyText}>{t("s1.p2")}</p>
            </>
          ),
        },
        {
          id: "eea",
          heading: numbered("02", t("s2.title")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li><Rich k="s2.residency" /></li>
              <li><Rich k="s2.dynamic" /></li>
              <li><Rich k="s2.retention" /></li>
              <li><Rich k="s2.profiling" /></li>
            </ul>
          ),
        },
        {
          id: "identity",
          heading: numbered("03", t("s3.title")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li><Rich k="s3.passkeys" /></li>
              <li><Rich k="s3.oidc" /></li>
              <li><Rich k="s3.payments" /></li>
            </ul>
          ),
        },
        {
          id: "agpl",
          heading: numbered("04", t("s4.title")),
          wrapperClassName: sectionWrapper,
          body: <p className={bodyText}><Rich k="s4.body" /></p>,
        },
        {
          id: "badges",
          heading: numbered("05", t("s5.title")),
          wrapperClassName: "scroll-mt-24",
          body: <TrustSealGrid />,
        },
      ]}
      footer={
        <LegalActionBar
          links={[
            { to: "/privacy", label: t("link.privacy") },
            { to: "/terms", label: t("link.terms") },
            { to: "/self-hosting", label: t("link.selfhost") },
          ]}
        />
      }
    />
  );
}

export const Route = createFileRoute("/sovereignty")({
  loader: () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => ({
    meta: pageMeta("sovereignty", loaderData?.locale),
  }),
  component: SovereigntyPage,
});
