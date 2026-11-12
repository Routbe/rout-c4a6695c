import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getGatewaySession } from "@/lib/gateway.functions";
import Page from "@/components/imported-pages/Gateway";
import { getRequestLocale } from "@/lib/locale.functions";
import { resolveHostProfile } from "@/lib/domain-routing.functions";
import { canonicalLinks } from "@/lib/social-meta";
import { PAGE_CARDS, pageMeta } from "@/lib/page-cards";
import { getPublicProfileByHandle } from "@/lib/studio-profile.functions";
import { fediverseHeadLinks, type FediverseIdentity } from "@/lib/fediverse-profile";
import { profileSocialMeta } from "@/lib/social-meta";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [locale, host] = await Promise.all([
      getRequestLocale().catch(() => ({ locale: "en" as const })),
      resolveHostProfile().catch(() => ({ handle: null as string | null })),
    ]);
    // Gateway sluice: a signed-in member's root is the cockpit (never on a member's own domain).
    if (!host.handle) {
      const session = await getGatewaySession().catch(() => ({ signedIn: false }));
      if (session.signedIn) throw redirect({ to: "/dashboard", replace: true });
    }
    const hostProfile = host.handle ? await getPublicProfileByHandle({ data: { handle: host.handle } }).catch(() => null) : null;
    return { ...locale, hostHandle: host.handle, hostProfile };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.hostProfile ? profileSocialMeta({ locale: loaderData.locale, handle: loaderData.hostHandle ?? "", displayName: loaderData.hostProfile["display_name"] as string | null, bio: loaderData.hostProfile["bio"] as string | null, avatarUrl: loaderData.hostProfile["avatar_url"] as string | null, url: "/" }) : [...pageMeta("home", loaderData?.locale ?? "en"), { name: "theme-color", content: PAGE_CARDS.home.themeColor }],
    links: [...canonicalLinks("/"), ...fediverseHeadLinks(loaderData?.hostProfile?.["fediverse"] as FediverseIdentity | null)],
    // ROUT's knowledge graph (Organization, founder, ROUT OS) is rendered sitewide from __root.
  }),
  component: HomeRoute,
});

// Custom-domain profiles only: kept out of the marketing gateway bundle.
const HostProfile = lazy(() => import("@/components/imported-pages/HostProfile").then((m) => ({ default: m.HostProfile })));

/** Op een gekoppeld eigen domein toont "/" het profiel van die eigenaar. */
function HomeRoute() {
  const { hostHandle } = Route.useLoaderData();
  if (hostHandle) {
    return (
      <Suspense fallback={null}>
        <HostProfile handle={hostHandle} />
      </Suspense>
    );
  }
  return <Page />;
}

