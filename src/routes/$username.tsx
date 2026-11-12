import { useEffect } from "react";
import { createFileRoute, redirect, useParams } from "@tanstack/react-router";
import { resolveMigratedHandle, resolveWorkspaceRootAlias } from "@/lib/workspace-public.functions";
import { Loader2 } from "lucide-react";
import { ProfileLookupError, ProfileMissing, ProfileView } from "@/components/profile/ProfileView";
import { InviteBanner } from "@/components/profile/InviteBanner";
import { ProfileSuspended } from "@/components/profile/ProfileSuspended";
import { ProfileFrozen } from "@/components/profile/ProfileFrozen";
import { ProfilePrivate } from "@/components/profile/ProfilePrivate";
import { useProfileRecord } from "@/hooks/useProfileRecord";
import {
  canonicalHandle,
  DEFAULT_URL_STYLE,
  isUrlStyle,
  rootRedirectFor,
  styledProfilePath,
  urlStyleForAtPreference,
  urlStyleHasAt,
} from "@/lib/profile-url";
import { looksLikeBase36Slug } from "@/lib/base36";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { ShortLinkResolver } from "@/components/imported-pages/ShortLink";
import { getPublicProfileByHandle } from "@/lib/studio-profile.functions";
import { getRequestLocale } from "@/lib/locale.functions";
import { canonicalLinks, profileJsonLd, profileSocialMeta, socialMeta } from "@/lib/social-meta";
import type { Locale } from "@/lib/i18n";
import { parseDisplayPrefs, bioForLocale } from "@/lib/profile-display";
import { useRecordVisit } from "@/hooks/useRecordVisit";
import { fediverseHeadLinks, type FediverseIdentity } from "@/lib/fediverse-profile";

type Row = Record<string, unknown> | null;

/**
 * Clean namespace: `rout.be/<handle>` is reserved for verified members.
 * Unverified handles keep living under `/u/<handle>` so the root namespace
 * never collides with product routes.
 */

function CleanProfile() {
  const { username } = useParams({ from: "/$username" });
  // rout.be/A89K — een 4-teken Base36-code is een short link, geen handle.
  if (looksLikeBase36Slug(username)) return <ShortLinkResolver slug={username} />;
  // A reserved slug (`/docs`, `/self-hosting`, `/claim`, …) can never be a
  // handle: show a clean not-found instead of querying the database.
  if (RESERVED_SLUGS.has(canonicalHandle(username))) {
    return <ProfileMissing username={canonicalHandle(username)} />;
  }
  return <HandleProfile username={username} />;
}

function HandleProfile({ username }: { username: string }) {
  const handle = canonicalHandle(username);
  const { profile, suspended, loading, error, retry } = useProfileRecord(handle, { free: false });

  // Bezoekstatistiek (privacyvriendelijk, geen persoonsgegevens).
  useRecordVisit(profile ? handle : null, "root");

  useEffect(() => {
    if (profile) document.title = `${profile.display_name || `@${profile.username}`} — ROUT`;
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A failed lookup must never render as "still available".
  if (error) {
    return <ProfileLookupError username={handle} onRetry={retry} />;
  }

  if (!profile) return <ProfileMissing username={handle} />;

  if (suspended || profile.status === "suspended" || profile.status === "banned") {
    return <ProfileSuspended username={handle} />;
  }

  // Self-paused (frozen) accounts stay private until the owner signs in again.
  if (profile.status === "frozen") {
    return <ProfileFrozen username={handle} />;
  }

  // Privé profiel: bezoekers zien geen inhoud of tijdlijn.
  if (!parseDisplayPrefs(profile.display_prefs).publicProfile) {
    return <ProfilePrivate username={handle} />;
  }

  // Shared identity, flexible URL: /handle, /@handle, /u/handle and /u/@handle
  // all render the same profile. Never a 404 or an interstitial gate.
  return (
    <>
      <InviteBanner handle={profile.username ?? ""} displayName={profile.display_name} />
      <ProfileView profile={profile} free={!profile.verified} />
    </>
  );
}

/**
 * Root namespace. A 4-teken Base36-code (`rout.be/A89K`) is a short link and
 * redirects at the edge; anything else is a member handle and falls through to
 * the app router.
 */
export const Route = createFileRoute("/$username")({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        if (!looksLikeBase36Slug(params.username)) return next();
        const { resolveShortLink, redirectResponse, rateLimitedResponse, pausedResponse } =
          await import("@/lib/short-link-redirect.server");
        const { RateLimitError } = await import("@/lib/rate-limit.server");
        try {
          const result = await resolveShortLink(params.username, request);
          if (result?.status === "ok") return redirectResponse(result.targetUrl);
          if (result?.status === "paused") return pausedResponse(request);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return rateLimitedResponse(error.retryAfterSeconds);
          }
        }
        return next();
      },
    },
  },
  loader: async ({ params }) => {
    const handle = canonicalHandle(params.username);
    let locale: Locale = "en";
    try {
      locale = (await getRequestLocale()).locale;
    } catch {
      /* keep the fallback */
    }
    if (looksLikeBase36Slug(params.username) || RESERVED_SLUGS.has(handle)) {
      return { handle, locale, profile: null as Row };
    }
    // Omgezet naar workspace: het oude adres stuurt 30 dagen tijdelijk door.
    const migrated = await resolveMigratedHandle({ data: { handle, space: "root" } }).catch(() => null);
    if (migrated) throw redirect({ to: "/w/$slug", params: { slug: migrated }, statusCode: 302 });
    let row: Row = null;
    try {
      row = (await getPublicProfileByHandle({ data: { handle } })) as Row;
    } catch {
      row = null;
    }
    if (row) {
      // Eén hoofd-URL per identiteit: de niet-gekozen vorm (met/zonder @)
      // stuurt permanent door naar de gekozen hoofd-URL.
      const style = isUrlStyle(row["url_style"]) ? row["url_style"] : DEFAULT_URL_STYLE;
      const target = rootRedirectFor(params.username, style);
      if (target) throw redirect({ href: target, statusCode: 301 });
    } else {
      const wsSlug = await resolveWorkspaceRootAlias({ data: { handle } }).catch(() => null);
      if (wsSlug) throw redirect({ to: "/w/$slug", params: { slug: wsSlug }, statusCode: 301 });
    }
    return { handle, locale, profile: row };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: socialMeta("en") };
    const { profile, handle, locale } = loaderData;
    const slug = (profile?.["username"] as string | undefined) ?? handle;
    const url = `https://rout.be/${slug}`;
    if (!profile) return { meta: socialMeta(locale), links: canonicalLinks(`/${slug}`) };
    // Canonical link wijst naar de gekozen hoofd-URL (met of zonder @).
    const rawStyle = profile["url_style"];
    const style = isUrlStyle(rawStyle) ? rawStyle : DEFAULT_URL_STYLE;
    const canonicalPath = styledProfilePath(slug, urlStyleForAtPreference(urlStyleHasAt(style)));
    return {
      links: [...canonicalLinks(canonicalPath), ...fediverseHeadLinks(profile["fediverse"] as FediverseIdentity | null, profile["social_links"])],
      scripts:
        profile["status"] === "frozen"
          ? []
          : profileJsonLd({
              handle: slug,
              url,
              displayName: profile["display_name"] as string | null,
              bio: profile["bio"] as string | null,
              avatarUrl: profile["avatar_url"] as string | null,
            }),
      meta: (() => {
        const prefs = parseDisplayPrefs(profile["display_prefs"]);
        return profileSocialMeta({
          locale,
          handle: (profile["username"] as string | undefined) ?? handle,
          displayName: profile["display_name"] as string | null,
          tagline: profile["tagline"] as string | null,
          bio: bioForLocale(prefs, profile["bio"] as string | null, locale),
          avatarUrl: profile["avatar_url"] as string | null,
          frozen: profile["status"] === "frozen",
          metaTitle: prefs.metaTitle,
          metaDescription: prefs.metaDescription,
          ogImageUrl: prefs.ogImageUrl,
          accentColor: prefs.accentColor,
          url,
        });
      })(),
    };
  },
  component: CleanProfile,
});
