import { Link } from "@/lib/router-compat";
import { Fingerprint, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const ICONS = [Fingerprint, Link2, ShieldCheck, Sparkles];

/** Stap 0: de rondleiding zelf — vier kaarten die uitleggen wat ROUT doet. */
export function TourIntroStep() {
  const { t } = useI18n();
  const cards = [0, 1, 2, 3].map((index) => ({
    Icon: ICONS[index] ?? Sparkles,
    title: t(`tour.intro.cards.${index}.title`),
    body: t(`tour.intro.cards.${index}.body`),
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("tour.intro.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("tour.intro.body")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-border bg-card p-4">
            <Icon className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("tour.intro.noAccount")}{" "}
        <Link to="/auth/sign-in" className="underline underline-offset-4 hover:text-foreground">
          {t("tour.intro.haveAccount")}
        </Link>
      </p>
    </div>
  );
}
