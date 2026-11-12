import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";

import { useEffect } from "react";
import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { Loader2 } from "lucide-react";
import { storeReferrer } from "@/lib/referral";
import { tagReferralVisit } from "@/lib/referral.functions";
import { useI18n } from "@/lib/i18n";

/**
 * Referral landing: `rout.be/r/<handle>`. Tags the visitor with the inviter and
 * forwards them to that member's profile, where the sign-up CTA lives.
 */

function ReferralLanding() {
  const { username } = useParams({ from: "/r/$username" });
  const navigate = useNavigate();
  const { t } = useI18n();
  const handle = username.replace(/^@/, "").toLowerCase();

  useEffect(() => {
    storeReferrer(handle);
    void tagReferralVisit({ data: { referrer: handle } }).catch(() => {});
    // Privacy: the referrer handle stays on this device only — nothing is logged.
    void navigate({ to: "/about", search: { ref: handle } as never, replace: true });
  }, [handle, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{t("referral.landing", { handle })}</p>
    </div>
  );
}

export const Route = createFileRoute("/r/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} nodigt je uit op ROUT` },
      { name: "description", content: "Maak je eigen soevereine profiel, QR-codes en korte links op ROUT — Europees en open source." },
      { property: "og:title", content: `@${params.username} nodigt je uit op ROUT` },
      { property: "og:description", content: "Maak je eigen soevereine profiel, QR-codes en korte links op ROUT — Europees en open source." },
      { property: "og:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { name: "twitter:image", content: "https://rout.be/brand/og/home-nl.png?v=3" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralLanding,
});
