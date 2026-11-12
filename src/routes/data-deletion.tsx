import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";

import { LegalActionBar } from "@/components/LegalActionBar";
import { LegalPage } from "@/components/LegalPage";
import { useI18n } from "@/lib/i18n";

function heading(n: string, text: string) {
  return (
    <h2 className="font-serif text-lg font-semibold text-foreground">
      <span className="mr-2 font-mono text-xs text-muted-foreground">{n}.</span>
      {text}
    </h2>
  );
}

const sectionWrapper = "mb-6 border-b border-border/40 pb-6 scroll-mt-24";
const bodyText = "text-sm leading-relaxed text-foreground/80";
const listClass = "space-y-2 pl-5 text-sm leading-relaxed text-foreground/80 [&>li]:list-decimal";
const strong = "font-medium text-foreground";

function DataDeletionPage() {
  const { t } = useI18n();
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
      title={t("dataDeletion.title")}
      updated={t("dataDeletion.updated")}
      card
      footer={
        <LegalActionBar
          links={[
            { to: "/privacy", label: t("terms.footer.privacy") },
            { to: "/terms", label: t("privacy.footer.terms") },
            { to: "/contact", label: t("terms.footer.contact") },
          ]}
        />
      }
      sections={[
        {
          id: "self-service",
          heading: heading("01", t("dataDeletion.heading.selfService")),
          wrapperClassName: sectionWrapper,
          body: (
            <>
              <p className={bodyText}>{t("dataDeletion.intro")}</p>
              <ol className={listClass}>
                <li>{t("dataDeletion.step1")}</li>
                <li>{t("dataDeletion.step2")}</li>
                <li>
                  <span className={strong}>{t("dataDeletion.step3.strong")}</span>{" "}
                  {t("dataDeletion.step3.text")}
                </li>
                <li>
                  <span className={strong}>{t("dataDeletion.step4.strong")}</span>{" "}
                  {t("dataDeletion.step4.text")}
                </li>
                <li>
                  <span className={strong}>{t("dataDeletion.step5.strong")}</span>{" "}
                  {t("dataDeletion.step5.a")} {mailLink} {t("dataDeletion.step5.b")}
                </li>
              </ol>
            </>
          ),
        },
        {
          id: "revoke",
          heading: heading("02", t("dataDeletion.heading.revoke")),
          wrapperClassName: "scroll-mt-24",
          body: <p className={bodyText}>{t("dataDeletion.revoke")}</p>,
        },
      ]}
    />
  );
}

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [...pathCardMeta("/data-deletion", "nl"), 
      { title: "Data deletion instructions — ROUT" },
      {
        name: "description",
        content:
          "How to disconnect linked services, revoke OAuth access and permanently delete your ROUT account and data.",
      },
      { property: "og:title", content: "Data deletion instructions — ROUT" },
      {
        property: "og:description",
        content: "Disconnect services, revoke OAuth tokens or delete your ROUT account and data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://rout.be/data-deletion" }],
  }),
  component: DataDeletionPage,
});
