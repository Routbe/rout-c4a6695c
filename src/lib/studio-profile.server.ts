import { hasProfilePro } from "./profile-entitlements";
import { isHandleBlock, normalizeSocialHandle } from "./social-handles";
import { sql } from "@/lib/neon";
import { isReservedHandle, normalizeHandle } from "@/lib/profile";
import { normalizeHandleForStorage } from "@/lib/handle-rules";

/**
 * Neon-backed data layer for the Profile Hub Studio.
 *
 * All profile content (handle, display name, blocks, styling) lives in the
 * Neon Postgres database in Frankfurt. Nothing in here touches the auth
 * provider or its environment variables — the caller passes the user id.
 */

export type StudioProfile = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  blocks: unknown[];
  verified: boolean;
  status: string;
  verifiedLegalName: string | null;
  /** Weergavevoorkeuren (badge, watermerk, achtergrond, typografie). */
  displayPrefs: Record<string, unknown>;
  /** Extra root-URL (rout.be/<naam>) van een geclaimd rootprofiel. */
  subdomainAlias: string | null;
  /** `none` | `pending_dns` | `active` — status van de rootclaim. */
  rootStatus: string | null;
  /** Handle van het gratis aliasprofiel (rout.be/u/<handle>). */
  aliasHandle: string | null;
  /** Goedgekeurde bedrijfsverificatie (zwarte badge). */
  isBusiness: boolean;
  /** Goedgekeurde influencerverificatie (roze badge). */
  isInfluencer: boolean;
};

type Row = Record<string, unknown>;

function toStudioProfile(row: Row): StudioProfile {
  return {
    username: (row["username"] as string | null) ?? null,
    displayName: (row["display_name"] as string | null) ?? null,
    tagline: (row["tagline"] as string | null) ?? null,
    avatarUrl: (row["avatar_url"] as string | null) ?? null,
    faviconUrl: (row["favicon_url"] as string | null) ?? null,
    theme: (row["theme"] as string | null) ?? "noir",
    cardStyle: (row["card_style"] as string | null) ?? "bordered",
    blocks: Array.isArray(row["blocks"]) ? (row["blocks"] as unknown[]) : [],
    verified: Boolean(row["verified"]),
    status: (row["status"] as string | null) ?? "active",
    verifiedLegalName: (row["verified_legal_name"] as string | null) ?? null,
    displayPrefs:
      row["display_prefs"] && typeof row["display_prefs"] === "object"
        ? (row["display_prefs"] as Record<string, unknown>)
        : {},
    subdomainAlias: (row["subdomain_alias"] as string | null) ?? null,
    rootStatus: (row["root_subdomain_status"] as string | null) ?? null,
    aliasHandle: (row["alias_handle"] as string | null) ?? null,
    isBusiness: row["is_business"] === true,
    isInfluencer: row["is_influencer"] === true,
  };
}

export async function readStudioProfile(userId: string): Promise<StudioProfile | null> {
  const rows = (await sql`
    select username, display_name, tagline, avatar_url, favicon_url, theme, card_style,
           blocks, verified, status, verified_legal_name,
           -- Tolerant: werkt ook wanneer migratie 18 nog niet is uitgevoerd.
           to_jsonb(profiles) -> 'display_prefs' as display_prefs,
           to_jsonb(profiles) ->> 'subdomain_alias' as subdomain_alias,
           to_jsonb(profiles) ->> 'root_subdomain_status' as root_subdomain_status,
           coalesce((to_jsonb(profiles) ->> 'is_business')::boolean, false) as is_business,
           coalesce((to_jsonb(profiles) ->> 'is_influencer')::boolean, false) as is_influencer
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  // Het aliasprofiel is een apart record; tolerant wanneer migratie 38 ontbreekt.
  try {
    const aliasRows = (await sql`
      select handle from public.alias_profiles where user_id = ${userId} limit 1
    `) as Row[];
    row["alias_handle"] = aliasRows[0]?.["handle"] ?? null;
  } catch {
    row["alias_handle"] = null;
  }
  return toStudioProfile(row);
}

export type StudioProfileInput = {
  username: string;
  displayName?: string | null;
  tagline?: string | null;
  avatarUrl?: string | null;
  faviconUrl?: string | null;
  theme?: string | null;
  cardStyle?: string | null;
  blocks?: unknown[];
  displayPrefs?: Record<string, unknown> | null;
};

/**
 * Zet de handle van elk sociaal blok om naar de canonieke opslagvorm
 * (getrimd, zonder `@`, lowercase). Niet-sociale blokken blijven ongemoeid.
 */
function normalizeBlockHandles(blocks: unknown[]): unknown[] {
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;
    const kind = typeof b["kind"] === "string" ? (b["kind"] as string) : "";
    const value = typeof b["value"] === "string" ? (b["value"] as string) : "";
    if (!kind || !value || !isHandleBlock(kind)) return block;
    return { ...b, value: normalizeSocialHandle(value) };
  });
}

export async function writeStudioProfile(userId: string, input: StudioProfileInput) {
  // Canonieke opslagvorm: lowercase, geen spaties, alleen toegestane tekens.
  const username = normalizeHandleForStorage(input.username);
  if (!username) throw new Error("handle_invalid");
  if (isReservedHandle(username)) throw new Error("handle_reserved");

  // Admin-ingestelde blokkades: alleen actief wanneer de waarde echt wijzigt.
  const { isFeatureBlocked } = await import("./admin-access.server");
  const currentRows = (await sql`
    select username, display_name from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const current = currentRows[0];
  if (current) {
    if (
      (current["username"] as string | null) !== username &&
      (await isFeatureBlocked(userId, "handle_change"))
    ) {
      throw new Error("handle_change_blocked");
    }
    if (
      (current["display_name"] as string | null) !== (input.displayName ?? null) &&
      (await isFeatureBlocked(userId, "name_change"))
    ) {
      throw new Error("name_change_blocked");
    }
  }

  // Eén gedeelde naamruimte: root-handles, root-domeinnamen én aliashandles.
  const { isHandleAvailableFor } = await import("./handle-namespace.server");
  if (!(await isHandleAvailableFor(username, userId))) throw new Error("handle_taken");

  // Geverifieerde accounts blijven aan hun wettelijke naam gekoppeld: de handle
  // moet de voornaam/achternaam-structuur volgen (server is de echte poortwachter).
  const identityRows = (await sql`
    select coalesce(verified, false) as verified,
           coalesce(nullif(trim(verified_legal_name), ''),
                    nullif(trim(concat_ws(' ', legal_first_name, legal_last_name)), '')) as legal_name
      from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const identity = identityRows[0];
  if (identity && identity["verified"] === true && identity["legal_name"]) {
    const { verifiedHandleError } = await import("./verified-handle");
    const issue = verifiedHandleError(username, (identity["legal_name"] as string | null) ?? null);
    if (issue) throw new Error("handle_identity_mismatch");
  }

  // Sociale handles worden canoniek (getrimd + lowercase) bewaard, zodat
  // publieke links altijd dezelfde vorm hebben.
  const blocks = normalizeBlockHandles(input.blocks ?? []);

  const rows = (await sql`
    insert into public.profiles (
      id, username, display_name, tagline, avatar_url, favicon_url, theme, card_style, blocks, updated_at
    ) values (
      ${userId}, ${username}, ${input.displayName ?? null}, ${input.tagline ?? null},
      ${input.avatarUrl ?? null}, ${input.faviconUrl ?? null},
      ${input.theme ?? "noir"}, ${input.cardStyle ?? "bordered"},
      ${JSON.stringify(blocks)}, now()
    )
    on conflict (id) do update set
      username = excluded.username,
      display_name = excluded.display_name,
      tagline = excluded.tagline,
      avatar_url = excluded.avatar_url,
      favicon_url = excluded.favicon_url,
      theme = excluded.theme,
      card_style = excluded.card_style,
      blocks = excluded.blocks,
      updated_at = now()
    returning username, display_name, tagline, avatar_url, favicon_url, theme, card_style,
              blocks, verified, status, verified_legal_name
  `) as Row[];

  // Aparte, tolerante update: profielen blijven opslaan wanneer migratie 18
  // nog niet gedraaid is.
  let displayPrefs: Record<string, unknown> = {};
  if (input.displayPrefs) {
    // Exclusieve badges zijn enkel kiesbaar na goedkeuring door een admin.
    const kind = input.displayPrefs["badgeType"];
    if (kind === "influencer" || kind === "domain") {
      const flags = (await sql`
        select coalesce((to_jsonb(profiles) ->> 'is_business')::boolean, false) as b,
               coalesce((to_jsonb(profiles) ->> 'is_influencer')::boolean, false) as i
          from public.profiles where id = ${userId} limit 1
      `) as Row[];
      const ok = kind === "influencer" ? flags[0]?.["i"] === true : flags[0]?.["b"] === true;
      if (!ok) input.displayPrefs = { ...input.displayPrefs, badgeType: "verified" };
    }
    try {
      const saved = (await sql`
        update public.profiles
           set display_prefs = (${JSON.stringify(input.displayPrefs)}::jsonb - 'firstUseTours' - 'qrSettings' - 'workspaceUi' - 'cardSecurity')
             || case when display_prefs ? 'firstUseTours'
                     then jsonb_build_object('firstUseTours', display_prefs->'firstUseTours')
                     else '{}'::jsonb end
             || case when display_prefs ? 'qrSettings'
                     then jsonb_build_object('qrSettings', display_prefs->'qrSettings')
                     else '{}'::jsonb end
             || case when display_prefs ? 'workspaceUi'
                     then jsonb_build_object('workspaceUi', display_prefs->'workspaceUi')
                     else '{}'::jsonb end
             || case when display_prefs ? 'cardSecurity'
                     then jsonb_build_object('cardSecurity', display_prefs->'cardSecurity')
                     else '{}'::jsonb end
         where id = ${userId}
        returning display_prefs
      `) as Row[];
      displayPrefs = (saved[0]?.["display_prefs"] as Record<string, unknown>) ?? {};
    } catch (error) {
      console.warn("[studio:display_prefs:skipped]", error);
    }
  }

  return { ...toStudioProfile(rows[0]!), displayPrefs };
}

export async function isHandleFree(rawHandle: string, userId: string | null) {
  const username = normalizeHandle(rawHandle);
  if (!username) return { ok: false, reason: "invalid" as const };
  if (isReservedHandle(username)) return { ok: false, reason: "reserved" as const };
  const { isHandleAvailableFor } = await import("./handle-namespace.server");
  if (await isHandleAvailableFor(username, userId)) return { ok: true, reason: null };
  return { ok: false, reason: "taken" as const };
}

/** Public profile lookup by handle (used by the /@handle pages). */
export async function readPublicProfile(rawHandle: string) {
  const username = normalizeHandle(rawHandle);
  if (!username) return null;
  let rows: Row[];
  try {
    rows = (await sql`
      select id, username, display_name, tagline, bio, profile_descriptions, avatar_url, favicon_url, theme, card_style,
             blocks, verified, verified_at, created_at, is_early_believer,
             status, is_suspended, is_banned, url_style, verified_legal_name,
             coalesce(show_total_reach, false) as show_total_reach,
             coalesce(total_reach_count, 0) as total_reach_count,
             to_jsonb(profiles) -> 'display_prefs' as display_prefs,
             to_jsonb(profiles) ->> 'country_code' as country_code,
             to_jsonb(profiles) ->> 'subdomain_alias' as subdomain_alias,
             coalesce((to_jsonb(profiles) ->> 'is_business')::boolean, false) as is_business,
             to_jsonb(profiles) ->> 'business_name' as business_name,
             coalesce((to_jsonb(profiles) ->> 'is_influencer')::boolean, false) as is_influencer
        from public.profiles
       where coalesce(verified, false) = true
         and (lower(username) = ${username}
              or lower(coalesce(subdomain_alias, '')) = ${username})
         and coalesce(is_banned, false) = false
         and coalesce(is_suspended, false) = false
         and coalesce(status, 'active') not in ('frozen', 'banned', 'suspended')
         and coalesce((to_jsonb(profiles)->'display_prefs'->>'publicProfile')::boolean, true)
       order by (lower(username) = ${username}) desc
       limit 1
    `) as Row[];
  } catch (error) {
    // Eén ontbrekende migratie (display_prefs, total_reach, subdomain_alias, …)
    // mag de publieke profielpagina nooit laten falen: val terug op de
    // kernkolommen die in elke schemaversie bestaan.
    console.warn("[public-profile:fallback]", username, error);
    rows = (await sql`
      select id, username, display_name, tagline, avatar_url, theme, card_style,
             blocks, verified, created_at,
             to_jsonb(profiles)->'display_prefs' as display_prefs
        from public.profiles
       where lower(username) = ${username}
         and coalesce(verified, false) = true
         and coalesce((to_jsonb(profiles)->>'is_banned')::boolean, false) = false
         and coalesce((to_jsonb(profiles)->>'is_suspended')::boolean, false) = false
         and coalesce(to_jsonb(profiles)->>'status', 'active') not in ('frozen', 'banned', 'suspended')
         and coalesce((to_jsonb(profiles)->'display_prefs'->>'publicProfile')::boolean, true)
       limit 1
    `) as Row[];
  }
  const profile = rows[0];
  if (!profile) return null;
  // Privacyschild: bevestigt enkel "echte mens". Wettelijke naam, handelsnaam en land
  // verlaten de server dan nooit — ook niet via de JSON van de pagina.
  {
    const { parseDisplayPrefs } = await import("./profile-display");
    const prefs = parseDisplayPrefs(profile["display_prefs"]);
    if (!prefs.publicProfile) return null;
    const { applyPrivacyShield } = await import("./privacy-shield-rules");
    applyPrivacyShield(profile, prefs);
  }
  // Gecachte sociale volgeraantallen: één goedkope join-vrije query, geen
  // externe HTTP-calls tijdens het laden van de publieke pagina. Een storing
  // hier mag het profiel zelf nooit mee naar beneden trekken.
  let socialLinks: unknown[] = [];
  try {
    const { readPublicSocialLinks } = await import("./social-verify.server");
    socialLinks = (await readPublicSocialLinks(profile["id"] as string)) ?? [];
  } catch (error) {
    console.warn("[public-profile:social-links:skipped]", username, error);
  }
  const trust = await readTrustMeta(profile);
  const { readFediverseProfile } = await import("./fediverse-profile.server");
  const fediverse = await readFediverseProfile(String(profile["id"])).catch(() => null);
  return { ...profile, ...trust, is_pro: hasProfilePro(profile), social_links: socialLinks, fediverse } as Row;
}

/**
 * Identity tier + genesis metadata for a public root profile. The blue mark needs
 * tier 2 (legal identity); members who paid the legacy verification keep theirs.
 */
async function readTrustMeta(profile: Row) {
  const id = profile["id"] as string;
  let legal = false;
  let human = false;
  let grandfathered = false;
  let earlyAt: string | null = null;
  try {
    const { tiersFor } = await import("./identity/identity-tiers");
    const rows = (await sql`
      select iv.verification_provider::text as provider, coalesce(iv.is_verified, false) as verified,
             coalesce((to_jsonb(p) ->> 'is_paid')::boolean, false) as is_paid,
             to_jsonb(p) ->> 'early_believer_at' as early_believer_at
        from public.profiles p
        left join public.identity_verifications iv on iv.user_id = p.id
       where p.id = ${id} limit 1`) as Row[];
    const r = rows[0];
    const tiers = tiersFor(r ? [{ provider: (r["provider"] as string | null) ?? null, verified: r["verified"] === true }] : []);
    legal = tiers.tier2LegalIdentity;
    human = tiers.tier1RealHuman;
    grandfathered = r?.["is_paid"] === true;
    earlyAt = (r?.["early_believer_at"] as string | null) ?? null;
  } catch (error) {
    console.warn("[public-profile:trust:skipped]", error);
  }
  let genesis: string | null = null;
  let earlyId: string | null = null;
  try {
    const { resolveAuthSecret } = await import("./better-auth.server");
    const secret = resolveAuthSecret()?.secret;
    if (secret && profile["created_at"]) {
      const { genesisStamp, earlyBelieverId } = await import("./genesis-stamp");
      genesis = await genesisStamp(secret, id, String(profile["created_at"] instanceof Date ? (profile["created_at"] as Date).toISOString() : profile["created_at"]));
      if (profile["is_early_believer"] === true) earlyId = await earlyBelieverId(secret, id);
    }
  } catch (error) {
    console.warn("[public-profile:genesis:skipped]", error);
  }
  return {
    legal_identity_verified: legal || grandfathered,
    real_human_verified: human,
    genesis_stamp: genesis,
    created_at_iso: profile["created_at"] ? new Date(profile["created_at"] as string).toISOString() : null,
    early_believer_id: earlyId,
    early_believer_at: earlyAt,
  };
}

/** Aggregated, privacy-clean studio analytics: counts only, no visitor data. */
export async function readStudioAnalytics(userId: string, days: number | null) {
  const qrRows = (await sql`
    select id from public.tracked_qrs where user_id = ${userId}
  `) as Row[];
  const ids = qrRows.map((r) => r["id"] as string);
  if (!ids.length) return { qrs: 0, scans: 0, series: [] as { date: string; scans: number }[] };

  const totals = (await sql`
    select count(*)::int as scans from public.qr_scans where tracked_qr_id = any(${ids}::uuid[])
  `) as Row[];

  const series = (
    days
      ? await sql`
        select to_char(date_trunc('day', scanned_at), 'YYYY-MM-DD') as date, count(*)::int as scans
          from public.qr_scans
         where tracked_qr_id = any(${ids}::uuid[])
           and scanned_at >= now() - make_interval(days => ${days})
         group by 1 order by 1
      `
      : await sql`
        select to_char(date_trunc('day', scanned_at), 'YYYY-MM-DD') as date, count(*)::int as scans
          from public.qr_scans
         where tracked_qr_id = any(${ids}::uuid[])
         group by 1 order by 1
      `
  ) as Row[];

  return {
    qrs: ids.length,
    scans: (totals[0]?.["scans"] as number | undefined) ?? 0,
    series: series.map((r) => ({ date: r["date"] as string, scans: r["scans"] as number })),
  };
}
