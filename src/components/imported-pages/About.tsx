import { useEffect, useMemo, useState } from "react";
import { captureReferralFromUrl } from "@/lib/referral";
import { EyeOff, Globe2, Lock } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  Download,
  HeartHandshake,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import { HumanLinkedIcon } from "@/components/profile/HumanLinkedIcon";
import { FleurDeLisIcon } from "@/components/profile/EarlyBelieverBadge";
import { AppLayout } from "@/components/layout/AppLayout";
import { BUNNY_PATH } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { CommunityMetrics, ReviewsStrip } from "@/components/community/Community";
import type { CommunityReview, CommunityStats } from "@/lib/community.functions";
import { Code2, Youtube, AtSign, Link2 } from "lucide-react";


/**
 * Publieke marketingpagina van ROUT.
 *
 * Alles is statisch en server-renderbaar: geen tracking, geen client-side
 * meting, geen cookiemuur. De enige interacties zijn het claimveld en de
 * vCard-download van het officiële @rout profiel.
 */

const MISSION = [
  { icon: Globe2, title: "about.mission.eu.title", body: "about.mission.eu.body" },
  { icon: EyeOff, title: "about.mission.trackers.title", body: "about.mission.trackers.body" },
  { icon: Lock, title: "about.mission.privacy.title", body: "about.mission.privacy.body" },
  { icon: ShieldCheck, title: "about.mission.identity.title", body: "about.mission.identity.body" },
] as const;

const HANDLE_RE = /[^a-z0-9._-]/g;

/** Eerlijke vergelijking met de klassieke link-in-bio-diensten — keys resolved via t(). */
const COMPARISON_KEYS = [
  {
    feature: "about.comparison.privacy.feature",
    others: "about.comparison.privacy.others",
    rout: "about.comparison.privacy.rout",
  },
  {
    feature: "about.comparison.qr.feature",
    others: "about.comparison.qr.others",
    rout: "about.comparison.qr.rout",
  },
  {
    feature: "about.comparison.stats.feature",
    others: "about.comparison.stats.others",
    rout: "about.comparison.stats.rout",
  },
  {
    feature: "about.comparison.domain.feature",
    others: "about.comparison.domain.others",
    rout: "about.comparison.domain.rout",
  },
  {
    feature: "about.comparison.data.feature",
    others: "about.comparison.data.others",
    rout: "about.comparison.data.rout",
  },
] as const;

const FEATURE_KEYS = [
  {
    icon: Sparkles,
    eyebrow: "about.features.profiles.eyebrow",
    title: "about.features.profiles.title",
    body: "about.features.profiles.body",
    points: [
      "about.features.profiles.point1",
      "about.features.profiles.point2",
      "about.features.profiles.point3",
    ],
  },
  {
    icon: BadgeCheck,
    eyebrow: "about.features.verification.eyebrow",
    title: "about.features.verification.title",
    body: "about.features.verification.body",
    points: [
      "about.features.verification.point1",
      "about.features.verification.point2",
      "about.features.verification.point3",
    ],
  },
  {
    icon: Mail,
    eyebrow: "about.features.secureshield.eyebrow",
    title: "about.features.secureshield.title",
    body: "about.features.secureshield.body",
    points: [
      "about.features.secureshield.point1",
      "about.features.secureshield.point2",
      "about.features.secureshield.point3",
    ],
  },
  {
    icon: HeartHandshake,
    eyebrow: "about.features.creator.eyebrow",
    title: "about.features.creator.title",
    body: "about.features.creator.body",
    points: [
      "about.features.creator.point1",
      "about.features.creator.point2",
      "about.features.creator.point3",
    ],
  },
] as const;

const ROUT_VCARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:ROUT",
  "ORG:ROUT Sovereign Identity",
  "EMAIL;TYPE=INTERNET,WORK:hallo@rout.be",
  "URL:https://rout.be",
  "ADR;TYPE=WORK:;;Brussels;;;Belgium",
  "NOTE:Sovereign QR & Identity Infrastructure",
  "END:VCARD",
].join("\r\n");

const PROFILE_LINK_KEYS = [
  { labelKey: "about.profileLinks.github", href: "https://github.com/Routbe" },
  { labelKey: "about.profileLinks.matrix", href: "https://matrix.to/#/#rout:matrix.org" },
  { labelKey: "about.profileLinks.contact", href: "mailto:hallo@rout.be" },
] as const;

function downloadVcard() {
  const blob = new Blob([ROUT_VCARD], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rout-contact.vcf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Authentiek, interactief @rout profiel — geen dummy-persoon. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RoutProfileCard() {
  const { t } = useI18n();
  const badges = useMemo(
    () => [
      t("about.profileCard.badge.verifiedPro"),
      t("about.profileCard.badge.sovereignCore"),
      t("about.profileCard.badge.openSource"),
    ],
    [t],
  );

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-foreground/5 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
            rout.be/rout
          </span>
        </div>
        <div className="flex flex-col items-center px-5 py-7 text-center sm:px-6">
          <div className="relative">
            <img
              src={BUNNY_PATH}
              alt={t("about.profileCard.emblemAlt")}
              className="h-20 w-20 rounded-full border border-border bg-background object-contain p-3"
              loading="lazy"
            />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card">
              <BadgeCheck className="h-4 w-4 text-primary" aria-hidden />
            </span>
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 font-serif text-lg font-medium text-foreground">
            ROUT
            <BadgeCheck
              className="h-4 w-4 text-primary"
              aria-label={t("about.profileCard.verifiedAriaLabel")}
            />
          </p>
          <a
            href="https://rout.be"
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            rout.be/rout
          </a>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("about.profileCard.tagline")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] tracking-wide text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
          <div className="mt-5 w-full space-y-2">
            {PROFILE_LINK_KEYS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noreferrer noopener"
                className="block rounded-xl border border-border bg-background/70 px-4 py-2.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
              >
                {t(link.labelKey)}
              </a>
            ))}
            <button
              type="button"
              onClick={downloadVcard}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {t("about.profileCard.saveVcard")}
            </button>
          </div>
          <p className="mt-6 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Made with ROUT
          </p>
        </div>
      </div>
    </div>
  );
}

function ComparisonMatrix() {
  const { t } = useI18n();
  return (
    <>
      {/* Desktop: vaste 3-koloms tabel */}
      <div className="mt-8 hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="w-1/3 p-4 font-semibold">{t("about.comparison.header.feature")}</th>
              <th className="w-1/3 p-4 font-semibold">{t("about.comparison.header.others")}</th>
              <th className="w-1/3 p-4 font-semibold">{t("about.comparison.header.rout")}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_KEYS.map((row) => (
              <tr key={row.feature} className="border-t border-border align-top">
                <td className="w-1/3 p-4 font-medium text-foreground">{t(row.feature)}</td>
                <td className="w-1/3 p-4 text-muted-foreground">{t(row.others)}</td>
                <td className="w-1/3 p-4 text-foreground">{t(row.rout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobiel: verticale vergelijkingskaarten */}
      <div className="mt-8 block md:hidden">
        {COMPARISON_KEYS.map((row) => (
          <div
            key={row.feature}
            className="mb-3 space-y-2 rounded-2xl border border-border/80 bg-card p-4 shadow-sm"
          >
            <p className="text-sm font-medium text-foreground">{t(row.feature)}</p>
            <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              <span className="mb-1 block text-[10px] uppercase tracking-wide">
                {t("about.comparison.header.others")}
              </span>
              {t(row.others)}
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-900 dark:text-emerald-200">
              <span className="mb-1 block text-[10px] uppercase tracking-wide">
                {t("about.comparison.header.rout")}
              </span>
              {t(row.rout)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function HandleClaim() {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const handle = useMemo(() => value.toLowerCase().replace(HANDLE_RE, "").slice(0, 30), [value]);
  // De claim start voortaan de rondleiding; de handle reist mee als startwaarde.
  const target = handle ? `/tour?handle=${encodeURIComponent(handle)}` : "/tour";

  return (
    <form
      className="mt-8 w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        window.location.assign(target);
      }}
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm sm:flex-row sm:items-center">
        <label htmlFor="claim-handle" className="sr-only">
          {t("about.handleClaim.label")}
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1 px-3">
          <span className="shrink-0 font-mono text-sm text-muted-foreground">rout.be/</span>
          <input
            id="claim-handle"
            value={handle}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("about.handleClaim.placeholder")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t("about.handleClaim.submit")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 px-2 text-xs text-muted-foreground">{t("about.handleClaim.hint")}</p>
    </form>
  );
}

const CARD = "rounded-3xl border border-border/80 bg-card/90 p-6 shadow-sm sm:p-8";

export default function About({ stats = null, reviews = [] }: { stats?: CommunityStats | null; reviews?: CommunityReview[] }) {
  const { t } = useI18n();
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  useEffect(() => {
    // Uitnodiging komt via de link (`/about?ref=<handle>`); bewaard tot registratie.
    setInvitedBy(captureReferralFromUrl());
  }, []);
  const pillars = [
    { icon: Youtube, label: t("about.pillars.youtube") },
    { icon: Code2, label: t("about.pillars.code") },
    { icon: AtSign, label: t("about.pillars.atproto") },
    { icon: Link2, label: t("about.pillars.domain") },
  ];
  const features = useMemo(
    () =>
      FEATURE_KEYS.map((feature) => ({
        icon: feature.icon,
        eyebrow: t(feature.eyebrow),
        title: t(feature.title),
        body: t(feature.body),
        points: feature.points.map((point) => t(point)),
      })),
    [t],
  );

  return (
    <AppLayout crumbs={[{ label: t("about.crumb") }]} trustBadges>
      {invitedBy && (
        <div className="mx-auto mt-3 w-fit rounded-full border border-border bg-muted px-4 py-1.5 text-xs font-medium">
          {t("about.invitedBy", { handle: invitedBy })}
        </div>
      )}
      {/* pb-28 houdt de laatste CTA vrij van de footer en de zwevende knop */}
      <div className="mx-auto max-w-5xl px-4 py-12 pb-28 sm:px-6 sm:py-20">
        {/* Manifest: alleen typografie, geen telefoon of carrousel. */}
        <section className="pt-4 sm:pt-10">
          <span className="eyebrow">{t("about.hero.eyebrow")}</span>
          <h1 className="mt-4 max-w-4xl font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            {t("about.hero.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t("about.hero.body")}
          </p>
          <HandleClaim />
        </section>

        <section className="mt-24 divide-y divide-border border-y border-border sm:mt-32">
          {MISSION.map((m, i) => (
            <article key={m.title} className="grid gap-4 py-10 sm:grid-cols-[120px_1fr] sm:py-14">
              <span className="font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="flex items-center gap-3 font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  <m.icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden />
                  {t(m.title)}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t(m.body)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-24 sm:mt-32">
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("about.comparisonTitle")}</h2>
          <ComparisonMatrix />
        </section>

        <section className="mt-24">
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("about.pillars.title")}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {pillars.map((p) => (
              <div key={p.label} className="flex items-center gap-4 rounded-3xl border border-border bg-card p-6">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-background">
                  <p.icon className="h-5 w-5 text-foreground" aria-hidden />
                </span>
                <p className="font-medium text-foreground">{p.label}</p>
              </div>
            ))}
          </div>
        </section>

        {stats && (
          <section className="mt-24">
            <h2 className="mb-8 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t("about.metrics.title")}</h2>
            <CommunityMetrics stats={stats} />
          </section>
        )}

        <div className="mt-24">
          <ReviewsStrip reviews={reviews} />
        </div>

        <section className="mt-24 rounded-[2rem] border border-border bg-card px-6 py-12 sm:px-12 sm:py-16">
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{t("about.manifesto.title")}</h2>
          <ol className="mt-8 space-y-6">
            {(["open", "privacy", "design"] as const).map((k, i) => (
              <li key={k} className="grid gap-2 sm:grid-cols-[80px_1fr]">
                <span className="font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-serif text-xl leading-relaxed text-foreground sm:text-2xl">{t(`about.manifesto.${k}`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Merktekens: exact dezelfde iconen als op een publiek profiel. */}
        <section className={`mt-16 ${CARD}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("verify.eyebrow")}
          </p>
          <h2 className="mt-2 font-serif text-xl font-semibold text-foreground sm:text-2xl">
            {t("verify.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
            {t("verify.intro")}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                key: "blue",
                mark: <BadgeCheck className="h-5 w-5 text-[#1d9bf0]" aria-hidden />,
                title: t("verify.badge.blue.title"),
                body: t("verify.badge.blue.body"),
                where: t("verify.badge.blue.where"),
              },
              {
                key: "shield",
                mark: <HumanLinkedIcon className="h-5 w-5 text-foreground/80" aria-hidden />,
                title: t("verify.badge.shield.title"),
                body: t("verify.badge.shield.body"),
                where: t("verify.badge.shield.where"),
              },
              {
                key: "early",
                mark: <FleurDeLisIcon className="h-5 w-5 text-amber-500" />,
                title: t("verify.badge.early.title"),
                body: t("verify.badge.early.body"),
                where: t("verify.badge.early.where"),
              },
            ].map((mark) => (
              <article
                key={mark.key}
                className="rounded-2xl border border-border bg-background/60 p-5"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card">
                  {mark.mark}
                </span>
                <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">
                  {mark.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{mark.body}</p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{mark.where}</p>
              </article>
            ))}
          </div>
          <Link
            to="/verify"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("about.finalCta.secondaryButton")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        {/* Eén ultieme CTA onderaan: de rondleiding is het startpunt. */}
        <section className="relative mt-16 overflow-hidden rounded-[2rem] border border-border bg-foreground px-6 py-12 text-center text-background shadow-lg sm:px-10 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-background/10 blur-3xl sm:h-80 sm:w-80"
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] opacity-60">
              {t("about.finalCta.title")}
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl font-serif text-2xl font-semibold leading-tight sm:text-4xl">
              {t("about.claimCta.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm opacity-80 sm:text-base">
              {t("about.claimCta.body")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/tour"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-background px-8 text-base font-semibold text-foreground shadow-sm transition-transform hover:scale-[1.02]"
              >
                {t("about.claimCta.button")}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 opacity-80 hover:underline hover:opacity-100">
                {t("about.finalCta.explore")} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <p className="text-xs opacity-60">{t("about.handleClaim.hint")}</p>
            </div>
          </div>
        </section>

      </div>
    </AppLayout>
  );
}
