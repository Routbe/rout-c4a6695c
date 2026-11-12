import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { canonicalLink, canonicalMeta, socialImageMeta } from "@/lib/site";
import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { LegalActionBar } from "@/components/LegalActionBar";
import { LegalPage } from "@/components/LegalPage";
import { LegalChips, type LegalChip } from "@/components/LegalChips";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GOOGLE_LIMITED_USE } from "@/lib/legal-constants";

const badgeClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground";

/**
 * Compliance badge. Uses a single neutral/positive status dot instead of an
 * emoji or a red indicator: red reads as "problem" next to a privacy claim.
 */
function Badge({
  children,
  tone = "positive",
}: {
  children: string;
  tone?: "positive" | "neutral";
}) {
  return (
    <span className={badgeClass}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "positive" ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {children}
    </span>
  );
}

function numbered(n: string, text: string) {
  return (
    <h2 className="font-serif text-lg font-semibold text-foreground">
      <span className="mr-2 font-mono text-xs text-muted-foreground">{n}.</span>
      {text}
    </h2>
  );
}

const sectionWrapper = "mb-6 border-b border-border/40 pb-6 scroll-mt-24";
const bodyText = "text-sm leading-relaxed text-foreground/80";
const listClass = "space-y-2 pl-4 text-sm leading-relaxed text-foreground/80 [&>li]:list-disc";
const strong = "font-medium text-foreground";

function PrivacyPage() {
  const { t } = useI18n();

  const chips: LegalChip[] = [
    { id: "controller", label: t("privacy.chip.controller") },
    { id: "static", label: t("privacy.chip.static") },
    { id: "dynamic", label: t("privacy.chip.dynamic") },
    { id: "accounts", label: t("privacy.chip.accounts") },
    { id: "oauth", label: t("privacy.chip.oauth") },
    { id: "domains", label: t("privacy.chip.domains") },
    { id: "api", label: t("privacy.chip.api") },
    { id: "payments", label: t("privacy.chip.payments") },
    { id: "hosting", label: t("privacy.chip.hosting") },
    { id: "rights", label: t("privacy.chip.rights") },
  ];

  const rights = [
    {
      title: t("privacy.rights.access.title"),
      detail: t("privacy.rights.access.detail"),
    },
    {
      title: t("privacy.rights.rectification.title"),
      detail: t("privacy.rights.rectification.detail"),
    },
    {
      title: t("privacy.rights.restriction.title"),
      detail: t("privacy.rights.restriction.detail"),
    },
    {
      title: t("privacy.rights.supervisory.title"),
      detail: t("privacy.rights.supervisory.detail"),
    },
  ];

  return (
    <LegalPage
      title={t("privacy.title")}
      updated={t("privacy.updated")}
      card
      subtitle={
        <div className="my-3 flex flex-wrap items-center gap-2">
          <Badge>{t("privacy.badge.hosted")}</Badge>
          <Badge>{t("privacy.badge.noTrackers")}</Badge>
          <Badge>{t("privacy.badge.gdpr")}</Badge>
          <Badge tone="neutral">{t("privacy.badge.gba")}</Badge>
        </div>
      }
      quickJump={<LegalChips chips={chips} />}
      sections={[
        {
          id: "controller",
          heading: numbered("01", t("privacy.section.controller.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>
                {t("privacy.section.controller.p1.a")}{" "}
                <span className={strong}>{t("privacy.section.controller.p1.strong")}</span>
                {t("privacy.section.controller.p1.b")}
              </p>
              <p className={bodyText}>
                {t("privacy.section.controller.p2.a")}{" "}
                <a
                  href="mailto:contact@rout.be"
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  contact@rout.be
                </a>
                {t("privacy.section.controller.p2.b")}{" "}
                <span className={strong}>{t("privacy.section.controller.p2.strong")}</span>
                {t("privacy.section.controller.p2.c")}
              </p>
              <p className={bodyText}>
                {t("privacy.section.controller.p3.a")}{" "}
                <span className={strong}>{t("privacy.section.controller.p3.strong")}</span>
                {t("privacy.section.controller.p3.b")}
              </p>
            </>
          ),
        },
        {
          id: "static",
          heading: (
            <h2 className="flex items-start gap-2 font-serif text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="mr-2 font-mono text-xs text-muted-foreground">02.</span>
                {t("privacy.section.static.heading")}
              </span>
            </h2>
          ),
          wrapperClassName:
            "my-6 scroll-mt-24 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-6 dark:bg-emerald-500/10",
          body: <p className={bodyText}>{t("privacy.section.static.body")}</p>,
        },
        {
          id: "dynamic",
          heading: numbered("03", t("privacy.section.dynamic.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>
                <span className={strong}>{t("privacy.section.dynamic.li1.strong")}</span>{" "}
                {t("privacy.section.dynamic.li1.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.dynamic.li2.strong")}</span>{" "}
                {t("privacy.section.dynamic.li2.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.dynamic.li3.strong")}</span>{" "}
                {t("privacy.section.dynamic.li3.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.dynamic.li4.strong")}</span>{" "}
                {t("privacy.section.dynamic.li4.a")}(
                <span className="font-mono text-xs">rout.id</span> /{" "}
                <span className="font-mono text-xs">rout.be</span>){" "}
                {t("privacy.section.dynamic.li4.b")}{" "}
                <span className={strong}>{t("privacy.section.dynamic.li4.strong2")}</span>
                {t("privacy.section.dynamic.li4.c")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.dynamic.li5.strong")}</span>{" "}
                {t("privacy.section.dynamic.li5.text")}
              </li>
            </ul>
          ),
        },
        {
          id: "accounts",
          heading: numbered("04", t("privacy.section.accounts.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>
                <span className={strong}>{t("privacy.section.accounts.li1.strong")}</span>{" "}
                {t("privacy.section.accounts.li1.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.accounts.li2.strong")}</span>{" "}
                {t("privacy.section.accounts.li2.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.accounts.li3.strong")}</span>{" "}
                {t("privacy.section.accounts.li3.text")}
              </li>
              <li>
                <span className={strong}>{t("privacy.section.accounts.li4.strong")}</span>{" "}
                {t("privacy.section.accounts.li4.text")}
              </li>
            </ul>
          ),
        },
        {
          id: "oauth",
          heading: numbered("05", t("privacy.section.oauth.heading")),
          wrapperClassName:
            "my-6 scroll-mt-24 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-6",
          body: (
            <>
              <p className={bodyText}>{t("privacy.section.oauth.intro")}</p>
              <ul className={listClass}>
                <li>
                  <span className={strong}>{t("privacy.section.oauth.tokens.strong")}</span>{" "}
                  {t("privacy.section.oauth.tokens.text")}
                </li>
                <li>
                  <span className={strong}>{t("privacy.section.oauth.google.strong")}</span>{" "}
                  {t("privacy.section.oauth.google.text")}
                </li>
                <li>
                  <span className={strong}>{t("privacy.section.oauth.snap.strong")}</span>{" "}
                  {t("privacy.section.oauth.snap.text")}
                </li>
                <li>
                  <span className={strong}>{t("privacy.section.oauth.meta.strong")}</span>{" "}
                  {t("privacy.section.oauth.meta.text")}
                </li>
                <li>{t("privacy.section.oauth.revoke")}</li>
              </ul>
              <p className={bodyText} lang="en">
                <em>{GOOGLE_LIMITED_USE}</em>
              </p>
            </>
          ),
        },
        {
          id: "domains",
          heading: numbered("06", t("privacy.section.domains.heading")),
          wrapperClassName: sectionWrapper,
          body: <p className={bodyText}>{t("privacy.section.domains.body")}</p>,
        },
        {
          id: "api",
          heading: numbered("07", t("privacy.section.api.heading")),
          wrapperClassName: sectionWrapper,
          body: <p className={bodyText}>{t("privacy.section.api.body")}</p>,
        },
        {
          id: "payments",
          heading: numbered("08", t("privacy.section.payments.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>{t("privacy.section.payments.p1")}</p>
              <p className={bodyText}>
                <span className={strong}>{t("privacy.section.payments.p2.strong")}</span>{" "}
                {t("privacy.section.payments.p2.text")}
              </p>
            </>
          ),
        },
        {
          id: "hosting",
          heading: numbered("09", t("privacy.section.hosting.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>
                {t("privacy.section.hosting.p1.a")}{" "}
                <span className={strong}>{t("privacy.section.hosting.p1.strong")}</span>
                {t("privacy.section.hosting.p1.b")}
              </p>
              <p className={bodyText}>
                <span className={strong}>{t("privacy.section.hosting.p2.strong")}</span>{" "}
                {t("privacy.section.hosting.p2.text")}
              </p>
            </>
          ),
        },
        {
          id: "rights",
          heading: numbered("10", t("privacy.section.rights.heading")),
          wrapperClassName: "scroll-mt-24",
          body: (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rights.map((r) => (
                <div
                  key={r.title}
                  className="rounded-lg border border-border/50 bg-background p-3.5 text-xs leading-relaxed text-muted-foreground"
                >
                  <strong className="mb-1 block text-foreground">{r.title}</strong>
                  {r.detail}
                </div>
              ))}
            </div>
          ),
        },
      ]}
      footer={
        <LegalActionBar
          links={[
            { to: "/contact", label: t("privacy.footer.contact") },
            { to: "/terms", label: t("privacy.footer.terms") },
            { to: "/data-deletion", label: t("legal.footer.dataDeletion") },
            { to: "/sovereignty", label: t("privacy.footer.sovereignty") },
          ]}
        />
      }
    />
  );
}

export const Route = createFileRoute("/privacy")({
  loader: () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => ({
    meta: pageMeta("privacy", loaderData?.locale),
  }),
  component: PrivacyPage,
});
