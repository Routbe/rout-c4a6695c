import { hasProfilePro } from "./profile-entitlements";
import { tiersFor } from "./identity/identity-tiers";
import { sql } from "@/lib/neon";
import { isReservedHandle, normalizeHandle } from "@/lib/profile";
import { normalizeHandleForStorage } from "@/lib/handle-rules";
import { strictHandleIssue } from "@/lib/handle-validation";
import { isHandleBlock, normalizeSocialHandle } from "./social-handles";

/**
 * Neon-datalaag voor het gratis aliasprofiel (`rout.be/u/<handle>`).
 *
 * Dit profiel staat volledig los van het geverifieerde rootprofiel in
 * `public.profiles`: eigen handle, naam, thema, blokken en voorkeuren, zodat
 * een gebruiker beide profielen apart kan beheren.
 */

type Row = Record<string, unknown>;

export type AliasProfile = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  blocks: unknown[];
  /** Aliasprofielen zijn nooit geverifieerd — het vinkje hangt aan de rootnamespace. */
  verified: boolean;
  status: string;
  verifiedLegalName: string | null;
  displayPrefs: Record<string, unknown>;
  /** Is het gekoppelde account geverifieerd? Bepaalt de mens-badge en Pro-opties. */
  ownerVerified: boolean;
  /** `profiles.username` — de roothandle van hetzelfde account (indien geverifieerd). */
  rootUsername: string | null;
  aliasHandle: string | null;
};

function toAliasProfile(row: Row): AliasProfile {
  const handle = (row["handle"] as string | null) ?? null;
  return {
    username: handle,
    displayName: (row["display_name"] as string | null) ?? null,
    tagline: (row["tagline"] as string | null) ?? null,
    avatarUrl: (row["avatar_url"] as string | null) ?? null,
    faviconUrl: (row["favicon_url"] as string | null) ?? null,
    theme: (row["theme"] as string | null) ?? "noir",
    cardStyle: (row["card_style"] as string | null) ?? "bordered",
    blocks: Array.isArray(row["blocks"]) ? (row["blocks"] as unknown[]) : [],
    verified: false,
    status: row["enabled"] === false ? "disabled" : "active",
    verifiedLegalName: null,
    displayPrefs:
      row["display_prefs"] && typeof row["display_prefs"] === "object"
        ? (row["display_prefs"] as Record<string, unknown>)
        : {},
    ownerVerified: Boolean(row["owner_verified"]),
    rootUsername: (row["root_username"] as string | null) ?? null,
    aliasHandle: handle,
  };
}

export async function readAliasProfile(userId: string): Promise<AliasProfile | null> {
  // Ook de rootgegevens meelezen: de Studio moet weten dat dit aliasprofiel bij
  // een geverifieerd account hoort (mens-badge, Pro-opties, tweede adres).
  const rows = (await sql`
    select a.handle, a.display_name, a.tagline, a.avatar_url, a.favicon_url, a.theme,
           a.card_style, a.blocks, a.display_prefs, a.enabled,
           coalesce(p.verified, false) as owner_verified,
           p.username as root_username
      from public.alias_profiles a
      join public.profiles p on p.id = a.user_id
     where a.user_id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  return row ? toAliasProfile(row) : null;
}

export type AliasProfileInput = {
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

/**
 * Is deze aliashandle vrij? Eén gedeelde naamruimte: botst niet met
 * rootprofielen, root-domeinnamen of andere aliassen.
 */
export async function isAliasHandleFree(rawHandle: string, userId: string | null) {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return { ok: false, reason: "invalid" as const };
  if (isReservedHandle(handle)) return { ok: false, reason: "reserved" as const };

  const { isHandleAvailableFor } = await import("./handle-namespace.server");
  if (!(await isHandleAvailableFor(handle, userId)))
    return { ok: false, reason: "taken" as const };

  return { ok: true, reason: null };
}

export async function writeAliasProfile(userId: string, input: AliasProfileInput) {
  const handle = normalizeHandleForStorage(input.username);
  if (!handle) throw new Error("handle_invalid");
  // Serverzijde spiegel van de aliasregel: minstens 5 tekens én 2 cijfers.
  if (strictHandleIssue(handle, { alias: true })) throw new Error("handle_invalid");
  if (isReservedHandle(handle)) throw new Error("handle_reserved");

  const free = await isAliasHandleFree(handle, userId);
  if (!free.ok) throw new Error(free.reason === "reserved" ? "handle_reserved" : "handle_taken");

  const blocks = normalizeBlockHandles(input.blocks ?? []);

  const rows = (await sql`
    insert into public.alias_profiles (
      user_id, handle, display_name, tagline, avatar_url, favicon_url,
      theme, card_style, blocks, display_prefs, updated_at
    ) values (
      ${userId}, ${handle}, ${input.displayName ?? null}, ${input.tagline ?? null},
      ${input.avatarUrl ?? null}, ${input.faviconUrl ?? null},
      ${input.theme ?? "noir"}, ${input.cardStyle ?? "bordered"},
      ${JSON.stringify(blocks)}::jsonb,
      ${JSON.stringify(input.displayPrefs ?? {})}::jsonb, now()
    )
    on conflict (user_id) do update set
      handle = excluded.handle,
      display_name = excluded.display_name,
      tagline = excluded.tagline,
      avatar_url = excluded.avatar_url,
      favicon_url = excluded.favicon_url,
      theme = excluded.theme,
      card_style = excluded.card_style,
      blocks = excluded.blocks,
      display_prefs = excluded.display_prefs,
      updated_at = now()
    returning handle, display_name, tagline, avatar_url, favicon_url, theme, card_style,
              blocks, display_prefs, enabled
  `) as Row[];

  return toAliasProfile(rows[0]!);
}

/**
 * Publieke lookup voor `/u/<handle>`. Levert een rij in hetzelfde formaat als
 * `readPublicProfile`, zonder identiteitsvinkje maar met de Pro-rechten van de eigenaar.
 */
export async function readPublicAliasProfile(rawHandle: string) {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  const rows = (await sql`
    select a.user_id as id, a.handle as username, a.display_name, a.tagline, a.bio, a.profile_descriptions,
           a.avatar_url, a.favicon_url, a.theme, a.card_style, a.blocks,
           a.display_prefs, a.created_at,
           coalesce(p.is_banned, false) as is_banned,
           coalesce(p.is_suspended, false) as is_suspended,
           coalesce(p.verified, false) as owner_verified,
           p.verified_at as owner_verified_at,
           coalesce((to_jsonb(p) ->> 'is_paid')::boolean, false) as owner_is_paid,
           to_jsonb(p) ->> 'tier' as owner_tier,
           to_jsonb(p) ->> 'url_style' as owner_url_style,
           iv.verification_provider::text as owner_identity_provider,
           coalesce(iv.is_verified, false) as owner_identity_verified
      from public.alias_profiles a
      join public.profiles p on p.id = a.user_id
      left join public.identity_verifications iv on iv.user_id = a.user_id
     where lower(a.handle) = ${handle}
       and a.enabled = true
       and coalesce(p.is_banned, false) = false
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  const { readFediverseProfile } = await import("./fediverse-profile.server");
  const fediverse = await readFediverseProfile(String(row["id"])).catch(() => null);
  return {
    ...row,
    fediverse,
    verified: false,
    is_pro: hasProfilePro({ verified: row["owner_verified"], is_paid: row["owner_is_paid"], tier: row["owner_tier"] }),
    // Het blauwe vinkje blijft bij het rootprofiel; het aliasprofiel toont het
    // mens-symbool wanneer het gekoppelde account geverifieerd is.
    // Tier 1 or 2 (or the legacy verified account) unlocks the discrete "Real Human" badge.
    human_linked: Boolean(row["owner_verified"]) || tiersFor([{ provider: (row["owner_identity_provider"] as string | null) ?? null, verified: row["owner_identity_verified"] === true }]).tier1RealHuman,
    verified_at: (row["owner_verified_at"] as string | null) ?? null,
    verified_legal_name: null,
    is_early_believer: false,
    status: "active",
    url_style: "u",
    // De @-voorkeur van de eigenaar stuurt de canonicalisatie binnen /u/.
    owner_url_style: (row["owner_url_style"] as string | null) ?? "u",
    show_total_reach: false,
    total_reach_count: 0,
    social_links: [],
  } as Row;
}

/**
 * Zorgt dat dit account een werkende gratis pagina heeft op `/u/<handle>`.
 *
 * Wordt aangeroepen bij registratie en als vangnet zodra de Studio het
 * aliasprofiel opvraagt. Idempotent: bestaat er al een rij, dan blijft die
 * ongemoeid. Zonder bruikbare voorkeursnaam krijgt het lid automatisch een
 * willekeurige vrije naam (bv. `jona4827`).
 */
export async function ensureFreeAliasProfile(
  userId: string,
  opts: { preferred?: string | null; seed?: string | null } = {},
): Promise<{ handle: string | null; created: boolean }> {
  try {

    const mine = (await sql`
      select handle from public.alias_profiles where user_id = ${userId} limit 1
    `) as Row[];
    if (mine[0]) return { handle: (mine[0]["handle"] as string | null) ?? null, created: false };

    // Zonder voorkeur valt de gratis naam terug op de huidige roothandle van
    // een nog niet geverifieerd account, anders op de weergavenaam.
    const profileRows = (await sql`
      select username, display_name, coalesce(verified, false) as verified
        from public.profiles where id = ${userId} limit 1
    `) as Row[];
    const profile = profileRows[0];
    const rootUsername = (profile?.["username"] as string | null) ?? null;
    const seed =
      opts.seed ?? (profile?.["display_name"] as string | null) ?? rootUsername ?? null;
    const preferred = opts.preferred ?? (profile?.["verified"] ? null : rootUsername);

    const { freeHandleCandidates } = await import("./free-handle");
    const { isHandleAvailableFor } = await import("./handle-namespace.server");

    for (const candidate of freeHandleCandidates(preferred, seed, 16)) {
      if (!(await isHandleAvailableFor(candidate, userId))) continue;
      try {
        await sql`
          insert into public.alias_profiles (user_id, handle, display_name, avatar_url, updated_at)
          values (
            ${userId}, ${candidate},
            ${(profile?.["display_name"] as string | null) ?? null},
            ${null},
            now()
          )
          on conflict (user_id) do nothing
        `;
      } catch {
        continue; // Naam werd tussentijds geclaimd: volgende kandidaat.
      }
      const check = (await sql`
        select handle from public.alias_profiles where user_id = ${userId} limit 1
      `) as Row[];
      if (check[0]) return { handle: check[0]["handle"] as string, created: true };
    }

    return { handle: null, created: false };
  } catch (error) {
    console.error("[alias:ensure:failed]", error);
    return { handle: null, created: false };
  }
}

/**
 * Bewaart de gratis handle wanneer een account naar een geverifieerde
 * roothandle verhuist.
 *
 * Zonder dit verdween `rout.be/u/<oude naam>` zodra `profiles.username`
 * werd hernoemd naar de geclaimde/geverifieerde naam. De oude (gratis) naam
 * blijft nu bestaan als aliasprofiel, zodat een account altijd twee adressen
 * houdt: `rout.be/u/user12` (gratis) en `rout.be/voornaam.achternaam`
 * (geverifieerd).
 *
 * Idempotent: bestaat er al een aliasprofiel, dan blijft dat ongemoeid.
 */
export async function preserveFreeAliasHandle(
  userId: string,
  previousHandle: string | null | undefined,
): Promise<{ ok: boolean; handle: string | null }> {
  const handle = normalizeHandleForStorage(String(previousHandle ?? ""));
  if (!handle) return { ok: false, handle: null };
  if (isReservedHandle(handle)) return { ok: false, handle: null };

  try {

    const mine = (await sql`
      select handle from public.alias_profiles where user_id = ${userId} limit 1
    `) as Row[];
    if (mine[0]) return { ok: true, handle: (mine[0]["handle"] as string | null) ?? null };

    const taken = (await sql`
      select user_id from public.alias_profiles
       where lower(handle) = ${handle} and user_id <> ${userId} limit 1
    `) as Row[];
    if (taken[0]) return { ok: false, handle: null };

    await sql`
      insert into public.alias_profiles (user_id, handle, updated_at)
      values (${userId}, ${handle}, now())
      on conflict (user_id) do nothing
    `;
    return { ok: true, handle };
  } catch {
    return { ok: false, handle: null };
  }
}
