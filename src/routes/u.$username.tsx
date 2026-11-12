import { useEffect } from "react";
import { createFileRoute, redirect, useParams } from "@tanstack/react-router";
import { getPublicWorkspace, resolveMigratedHandle } from "@/lib/workspace-public.functions";
import { Loader2 } from "lucide-react";
import { ProfileLookupError, ProfileMissing, ProfileView } from "@/components/profile/ProfileView";
import { InviteBanner } from "@/components/profile/InviteBanner";
import { ProfileSuspended } from "@/components/profile/ProfileSuspended";
import { ProfileFrozen } from "@/components/profile/ProfileFrozen";
import { ProfilePrivate } from "@/components/profile/ProfilePrivate";
import { useProfileRecord } from "@/hooks/useProfileRecord";
import { getPublicAliasProfileByHandle } from "@/lib/alias-profile.functions";
import { getRequestLocale } from "@/lib/locale.functions";
import { canonicalLinks, profileJsonLd, profileSocialMeta, socialMeta } from "@/lib/social-meta";
import type { Locale } from "@/lib/i18n";
import { parseDisplayPrefs, bioForLocale } from "@/lib/profile-display";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { useRecordVisit } from "@/hooks/useRecordVisit";
import { fediverseHeadLinks, type FediverseIdentity } from "@/lib/fediverse-profile";
import {
  aliasRedirectFor,
  DEFAULT_URL_STYLE,
  isUrlStyle,
  urlStyleHasAt,
} from "@/lib/profile-url";

type Row = Record<string, unknown> | null;

function FreeProfile() {
  const { username } = useParams({ strict: false }) as { username: string };
  // Normalise: strip a leading @ so /u/john and /u/@john resolve identically.
  const handle = username.replace(/^@/, "").toLowerCase();
  const { profile, suspended, loading, error, retry } = useProfileRecord(handle, { free: true });

  // Bezoekstatistiek (privacyvriendelijk, geen persoonsgegevens).
  useRecordVisit(profile ? handle : null, "alias");

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

  if (!profile) return <ProfileMissing username={handle} free />;

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

  return (
    <>
      <InviteBanner handle={profile.username ?? ""} displayName={profile.display_name} />
      <ProfileView profile={profile} free />
    </>
  );
}

export const Route = createFileRoute("/u/$username")({
  /**
   * Server-side lookup so crawlers (Mastodon, Bluesky, WhatsApp …) receive a
   * real profile card instead of the generic site card.
   */
  loader: async ({ params }) => {
    const handle = sanitizeHandleInput(params.username);
    let locale: Locale = "en";
    try {
      locale = (await getRequestLocale()).locale;
    } catch {
      /* keep the fallback */
    }
    const migrated = await resolveMigratedHandle({ data: { handle, space: "alias" } }).catch(() => null);
    if (migrated) throw redirect({ to: "/w/$slug", params: { slug: migrated }, statusCode: 302 });
    let row: Row = null;
    try {
      row = (await getPublicAliasProfileByHandle({ data: { handle } })) as Row;
    } catch {
      row = null;
    }
    if (row) {
      // Eén hoofd-URL per identiteit: de niet-gekozen vorm (met/zonder @)
      // stuurt permanent door naar de gekozen hoofd-URL binnen /u/.
      const rawStyle = row["owner_url_style"];
      const style = isUrlStyle(rawStyle) ? rawStyle : DEFAULT_URL_STYLE;
      const target = aliasRedirectFor(params.username, style);
      if (target) throw redirect({ href: target, statusCode: 301 });
    }
    if (!row) {
      // /u/ is for people only: a workspace address typed with /u/ goes to /w/.
      const ws = await getPublicWorkspace({ data: { slug: handle } }).catch(() => null);
      if (ws) throw redirect({ to: "/w/$slug", params: { slug: ws.slug }, statusCode: 301 });
    }
    return { handle, locale, profile: row };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: socialMeta("en") };
    const { profile, handle, locale } = loaderData;
    const slug = (profile?.["username"] as string | undefined) ?? handle;
    const url = `https://rout.be/u/${slug}`;
    if (!profile) return { meta: socialMeta(locale), links: canonicalLinks(`/u/${slug}`) };
    // Canonical link wijst naar de gekozen hoofd-URL (met of zonder @).
    const rawStyle = profile["owner_url_style"];
    const style = isUrlStyle(rawStyle) ? rawStyle : DEFAULT_URL_STYLE;
    const canonicalPath = `/u/${urlStyleHasAt(style) ? "@" : ""}${slug}`;
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
          space: "alias",
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
  component: FreeProfile,
});
