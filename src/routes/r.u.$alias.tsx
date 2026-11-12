import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { storeReferrer } from "@/lib/referral";
import { tagReferralVisit } from "@/lib/referral.functions";
import { useI18n } from "@/lib/i18n";

/** Referral landing for free aliases: `rout.be/r/u/<alias>` → `/u/<alias>`. */
function AliasReferralLanding() {
  const { alias } = useParams({ from: "/r/u/$alias" });
  const navigate = useNavigate();
  const { t } = useI18n();
  const handle = alias.replace(/^@/, "").toLowerCase();

  useEffect(() => {
    // First touch wins (storeReferrer never overwrites); validated server-side on claim.
    storeReferrer(handle);
    void tagReferralVisit({ data: { referrer: handle } }).catch(() => {});
    void navigate({ to: "/about", search: { ref: `u_${handle}` } as never, replace: true });
  }, [handle, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{t("referral.landing", { handle })}</p>
    </div>
  );
}

export const Route = createFileRoute("/r/u/$alias")({
  head: () => ({
    meta: [
      { title: "Uitnodiging — ROUT" },
      { name: "description", content: "Je bent uitgenodigd om je digitale identiteit op ROUT te claimen." },
      { property: "og:title", content: "Uitnodiging — ROUT" },
      { property: "og:description", content: "Je bent uitgenodigd om je digitale identiteit op ROUT te claimen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AliasReferralLanding,
});
