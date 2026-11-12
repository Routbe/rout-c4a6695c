import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { canonicalLink, canonicalMeta, socialImageMeta } from "@/lib/site";
import { LegalActionBar } from "@/components/LegalActionBar";
import { LegalPage } from "@/components/LegalPage";
import { LegalChips, type LegalChip } from "@/components/LegalChips";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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

function TermsPage() {
  const { t } = useI18n();

  const chips: LegalChip[] = [
    { id: "scope", label: t("terms.chip.scope") },
    { id: "handles", label: t("terms.chip.handles") },
    { id: "third-party", label: t("terms.chip.thirdParty") },
    { id: "payments", label: t("terms.chip.payments") },
    { id: "fair-use", label: t("terms.chip.fairUse") },
    { id: "print-warning", label: t("terms.chip.printWarning") },
    { id: "domains", label: t("terms.chip.domains") },
    { id: "api", label: t("terms.chip.api") },
    { id: "sla", label: t("terms.chip.sla") },
    { id: "licensing", label: t("terms.chip.licensing") },
    { id: "jurisdiction", label: t("terms.chip.jurisdiction") },
  ];

  const mailLink = (
    <a
      href="mailto:contact@rout.be"
      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
    >
      contact@rout.be
    </a>
  );

  return (
    <LegalPage
      title={t("terms.title")}
      updated={t("terms.updated")}
      card
      quickJump={<LegalChips chips={chips} />}
      footer={
        <LegalActionBar
          links={[
            { to: "/privacy", label: t("terms.footer.privacy") },
            { to: "/data-deletion", label: t("legal.footer.dataDeletion") },
            { to: "/sovereignty", label: t("terms.footer.sovereignty") },
            { to: "/contact", label: t("terms.footer.contact") },
          ]}
        />
      }
      sections={[
        {
          id: "scope",
          heading: numbered("01", t("terms.section.scope.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>{t("terms.section.scope.p1")}</p>
              <ul className={listClass}>
                <li>
                  <span className={strong}>{t("terms.section.scope.li1.strong")}</span>{" "}
                  {t("terms.section.scope.li1.text")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.scope.li2.strong")}</span>{" "}
                  {t("terms.section.scope.li2.a")} (
                  <span className="font-mono text-xs">rout.be</span>).{" "}
                  {t("terms.section.scope.li2.b")}
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "handles",
          heading: numbered("02", t("terms.section.handles.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.handles.li1")}</li>
              <li>{t("terms.section.handles.li2")}</li>
              <li>
                <span className={strong}>{t("terms.section.handles.li3.strong")}</span>{" "}
                {t("terms.section.handles.li3.a")} {mailLink}
                {t("terms.section.handles.li3.b")}
              </li>
              <li>{t("terms.section.handles.li4")}</li>
            </ul>
          ),
        },
        {
          id: "domains",
          heading: numbered("03", t("terms.section.domains.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.domains.li1")}</li>
              <li>{t("terms.section.domains.li2")}</li>
            </ul>
          ),
        },
        {
          id: "api",
          heading: numbered("04", t("terms.section.api.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.api.li1")}</li>
              <li>{t("terms.section.api.li2")}</li>
            </ul>
          ),
        },
        {
          id: "third-party",
          heading: numbered("05", t("terms.section.thirdParty.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.thirdParty.li1")}</li>
              <li>
                <span className={strong}>{t("terms.section.thirdParty.li2.strong")}</span>{" "}
                {t("terms.section.thirdParty.li2.text")}
              </li>
              <li>{t("terms.section.thirdParty.li3")}</li>
            </ul>
          ),
        },
        {
          id: "payments",
          heading: numbered("06", t("terms.section.payments.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.payments.li1")}</li>
              <li>
                {t("terms.section.payments.li2.a")}{" "}
                <span className={strong}>{t("terms.section.payments.li2.strong")}</span>.
              </li>
              <li>
                <span className={strong}>{t("terms.section.payments.li3.strong")}</span>{" "}
                {t("terms.section.payments.li3.a")}{" "}
                <span className={strong}>{t("terms.section.payments.li3.strong2")}</span>
                {t("terms.section.payments.li3.b")} {mailLink}
                {t("terms.section.payments.li3.c")}
              </li>
            </ul>
          ),
        },
        {
          id: "fair-use",
          heading: numbered("07", t("terms.section.fairUse.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>{t("terms.section.fairUse.intro")}</p>
              <ul className={listClass}>
                <li>{t("terms.section.fairUse.li1")}</li>
                <li>{t("terms.section.fairUse.li2")}</li>
                <li>{t("terms.section.fairUse.li3")}</li>
              </ul>
              <p className={bodyText}>
                <span className={strong}>{t("terms.section.fairUse.p2.strong")}</span>{" "}
                {t("terms.section.fairUse.p2.text")}
              </p>
              <ul className={listClass}>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.li4.strong")}</span>{" "}
                  {t("terms.section.fairUse.li4.a")}{" "}
                  <a
                    href="mailto:abuse@rout.id"
                    className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                  >
                    abuse@rout.id
                  </a>
                  . {t("terms.section.fairUse.li4.b")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.li5.strong")}</span>{" "}
                  {t("terms.section.fairUse.li5.text")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.li6.strong")}</span>{" "}
                  {t("terms.section.fairUse.li6.a")} {mailLink}
                  {t("terms.section.fairUse.li6.b")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.harassment.strong")}</span>{" "}
                  {t("terms.section.fairUse.harassment.text")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.ugc.strong")}</span>{" "}
                  {t("terms.section.fairUse.ugc.text")}
                </li>
                <li>
                  <span className={strong}>{t("terms.section.fairUse.takedown.strong")}</span>{" "}
                  {t("terms.section.fairUse.takedown.a")} {mailLink}
                  {t("terms.section.fairUse.takedown.b")}
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "print-warning",
          heading: (
            <h2 className="flex items-start gap-2 font-serif text-lg font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="mr-2 font-mono text-xs text-muted-foreground">08.</span>
                {t("terms.section.printWarning.heading")}
              </span>
            </h2>
          ),
          wrapperClassName:
            "my-6 scroll-mt-24 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-6 dark:bg-amber-500/10",
          body: (
            <ul className={listClass}>
              <li>{t("terms.section.printWarning.li1")}</li>
              <li>
                <span className={strong}>{t("terms.section.printWarning.li2.strong")}</span>{" "}
                {t("terms.section.printWarning.li2.a")}{" "}
                <em>{t("terms.section.printWarning.li2.em")}</em>
                {t("terms.section.printWarning.li2.b")}
              </li>
              <li>
                <span className={strong}>{t("terms.section.printWarning.li3.strong")}</span>{" "}
                {t("terms.section.printWarning.li3.text")}
              </li>
              <li>
                <span className={strong}>{t("terms.section.printWarning.indemnity.strong")}</span>{" "}
                {t("terms.section.printWarning.indemnity.text")}
              </li>
            </ul>
          ),
        },
        {
          id: "sla",
          heading: numbered("09", t("terms.section.sla.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>
                {t("terms.section.sla.li1.a")}{" "}
                <span className={strong}>{t("terms.section.sla.li1.strong1")}</span>{" "}
                {t("terms.section.sla.li1.b")}{" "}
                <span className={strong}>{t("terms.section.sla.li1.strong2")}</span>{" "}
                {t("terms.section.sla.li1.c")}
              </li>
              <li>{t("terms.section.sla.li2")}</li>
            </ul>
          ),
        },
        {
          id: "licensing",
          heading: numbered("10", t("terms.section.licensing.heading")),
          wrapperClassName: sectionWrapper,
          body: (
            <ul className={listClass}>
              <li>
                {t("terms.section.licensing.li1.a")}{" "}
                <span className={strong}>{t("terms.section.licensing.li1.strong")}</span>
                {t("terms.section.licensing.li1.b")}
              </li>
              <li>
                {t("terms.section.licensing.li2.a")}{" "}
                <a
                  href="https://rout.be"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  rout.be
                </a>
                . {t("terms.section.licensing.li2.b")}
              </li>
            </ul>
          ),
        },
        {
          id: "creator",
          heading: numbered("11", t("terms.section.creator.heading")),
          wrapperClassName: sectionWrapper,
          body: <p className={bodyText}>{t("terms.section.creator.body")}</p>,
        },
        {
          id: "jurisdiction",
          heading: numbered("12", t("terms.section.jurisdiction.heading")),
          wrapperClassName: sectionWrapper,
          body: <p className={bodyText}>{t("terms.section.jurisdiction.body")}</p>,
        },
        {
          id: "contact",
          heading: numbered("13", t("terms.section.contact.heading")),
          wrapperClassName: "scroll-mt-24",
          body: (
            <p className={bodyText}>
              {t("terms.section.contact.body")} {mailLink}. {t("terms.section.contact.legalRefs")}
            </p>
          ),
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/terms")({
  loader: () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => ({
    meta: pageMeta("terms", loaderData?.locale),
  }),
  component: TermsPage,
});
