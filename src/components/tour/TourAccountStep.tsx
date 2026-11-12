import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Laatste stap: alles staat klaar → door naar het gewone registratievenster. */
export function TourAccountStep({
  handle,
  displayName,
  onRegister,
}: {
  handle: string;
  displayName: string;
  onRegister: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.account.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.account.intro")}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">{t("tour.account.firstAddress")}</p>
        <p className="mt-1 font-medium">rout.be/u/{handle || t("tour.handleExample")}</p>
        {displayName ? <p className="mt-1 text-muted-foreground">{displayName}</p> : null}
      </div>

      <Button type="button" className="h-12 w-full" onClick={onRegister}>
        {t("tour.account.register")}
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Button>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t("tour.account.kept")}
      </p>
    </div>
  );
}
