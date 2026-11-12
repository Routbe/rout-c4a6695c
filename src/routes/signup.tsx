import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { captureReferralFromUrl } from "@/lib/referral";

/**
 * Uitnodigingslanding: `rout.be/signup?ref=u_jona`. De code wordt 30 dagen
 * bewaard (localStorage + cookie) en de bezoeker gaat door naar het aanmelden.
 */
export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: i18next.t("auth.meta.signup") },
      {
        name: "description",
        content:
          i18next.t("auth.meta.signupDescription"),
      },
      { property: "og:title", content: i18next.t("auth.meta.signup") },
      {
        property: "og:description",
        content: i18next.t("auth.meta.signupDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignupLanding,
});

function SignupLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    captureReferralFromUrl();
    void navigate({ to: "/auth/$authView", params: { authView: "sign-up" }, replace: true });
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      <h1 className="text-sm text-muted-foreground">{t("auth.signup.loading")}</h1>
    </main>
  );
}
