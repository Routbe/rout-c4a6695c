import { Link } from "@/lib/router-compat";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Standardised bottom action bar shared by /sovereignty, /privacy and /terms.
 * Primary CTA plus quick policy links, rendered above the footer.
 */
export function LegalActionBar({
  title,
  subtitle,
  links,
}: {
  title?: string;
  subtitle?: string;
  links: { to: string; label: string }[];
}) {
  const { t } = useI18n();
  return (
    <div className="mt-8 rounded-2xl border border-border/50 bg-card p-5 text-center shadow-sm sm:p-8">
      <h2 className="font-serif text-xl font-medium text-foreground sm:text-2xl">{title ?? t("pages.legalBar.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle ?? t("pages.legalBar.subtitle")}</p>
      <Link
        to="/"
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 sm:w-auto"
      >
        {t("pages.legalBar.cta")}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
