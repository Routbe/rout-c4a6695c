import { BadgeCheck, Building2, CreditCard, Fingerprint } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { HumanLinkedIcon } from "@/components/profile/HumanLinkedIcon";
import { FleurDeLisIcon } from "@/components/profile/EarlyBelieverBadge";
import { useI18n } from "@/lib/i18n";

/**
 * Publieke uitleg over de drie merktekens die ROUT uitdeelt.
 *
 * De iconen komen uit dezelfde componenten als het publieke profiel, zodat de
 * uitleg altijd hetzelfde toont als wat een bezoeker echt te zien krijgt.
 */

const STEP_KEYS = [
  { icon: CreditCard, title: "verify.step1.title", body: "verify.step1.body" },
  { icon: Building2, title: "verify.step2.title", body: "verify.step2.body" },
  { icon: BadgeCheck, title: "verify.step3.title", body: "verify.step3.body" },
] as const;

const CARD = "rounded-2xl border border-border bg-card/60 p-6 shadow-sm";

export default function VerifyGuide() {
  const { t } = useI18n();

  const marks = [
    {
      key: "blue",
      mark: <BadgeCheck className="h-6 w-6 text-[#1d9bf0]" aria-hidden />,
      title: t("verify.badge.blue.title"),
      body: t("verify.badge.blue.body"),
      where: t("verify.badge.blue.where"),
    },
    {
      key: "shield",
      mark: <HumanLinkedIcon className="h-6 w-6 text-foreground/80" aria-hidden />,
      title: t("verify.badge.shield.title"),
      body: t("verify.badge.shield.body"),
      where: t("verify.badge.shield.where"),
    },
    {
      key: "early",
      mark: <FleurDeLisIcon className="h-6 w-6 text-amber-500" />,
      title: t("verify.badge.early.title"),
      body: t("verify.badge.early.body"),
      where: t("verify.badge.early.where"),
    },
  ];

  return (
    <AppLayout crumbs={[{ label: t("verify.crumb") }]}>
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <span className="eyebrow">{t("verify.eyebrow")}</span>
        <h1 className="mb-3 mt-2 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {t("verify.title")}
        </h1>
        <p className="mb-12 border-b-2 border-dashed border-border-ink/25 pb-8 font-sans text-lg text-muted-foreground">
          {t("verify.intro")}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {marks.map((mark) => (
            <section key={mark.key} className={CARD}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                {mark.mark}
              </span>
              <h2 className="mt-4 font-serif text-xl font-semibold text-foreground">
                {mark.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mark.body}</p>
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">{mark.where}</p>
            </section>
          ))}
        </div>

        <h2 className="mb-4 mt-12 font-serif text-2xl font-semibold text-foreground">
          {t("verify.steps.title")}
        </h2>
        <ol className="space-y-4">
          {STEP_KEYS.map(({ icon: Icon, ...step }, index) => (
            <li key={step.title} className={`flex gap-4 ${CARD} p-5`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background font-mono text-xs">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {t(step.title)}
                </h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                  {t(step.body)}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
            <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t("verify.keep.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("verify.keep.body")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/auth/sign-in"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t("verify.cta.start")}
            </Link>
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {t("verify.cta.privacy")}
            </Link>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
