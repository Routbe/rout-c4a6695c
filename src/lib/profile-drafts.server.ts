import { sql } from "@/lib/neon";
import type { AliasProfileInput } from "@/lib/alias-profile.server";
import type { StudioProfileInput } from "@/lib/studio-profile.server";
import type { ProfileQrStyle } from "@/lib/profile-qr";

export type ProfileSpace = "verified" | "alias";
export type ProfileDraftPayload = StudioProfileInput | AliasProfileInput;
export type SerializableDraftPayload = {
  username: string;
  displayName?: string | null;
  tagline?: string | null;
  avatarUrl?: string | null;
  faviconUrl?: string | null;
  theme?: string | null;
  cardStyle?: string | null;
  blocks?: Record<string, string | number | boolean | null | (string | number | boolean | null)[]>[];
  displayPrefs?: Record<string, string | number | boolean | null | (string | number | boolean | null)[]> | null;
};

export type DraftMeta = {
  draftRevision: number;
  publishedRevision: number;
  hasUnpublishedChanges: boolean;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

type Row = Record<string, unknown>;

function rowMeta(row: Row): DraftMeta {
  const draftRevision = Number(row["revision"] ?? 0);
  const publishedRevision = Number(row["published_revision"] ?? 0);
  return {
    draftRevision,
    publishedRevision,
    hasUnpublishedChanges: draftRevision !== publishedRevision,
    draftUpdatedAt: (row["updated_at"] as string | null) ?? null,
    publishedAt: (row["published_at"] as string | null) ?? null,
  };
}

export async function readOrCreateProfileDraft(
  userId: string,
  space: ProfileSpace,
  livePayload: ProfileDraftPayload,
): Promise<{ payload: SerializableDraftPayload; meta: DraftMeta }> {
  await sql`
    insert into public.profile_drafts (user_id, space, payload, revision, published_revision, published_at)
    values (${userId}, ${space}, ${JSON.stringify(livePayload)}::jsonb, 1, 1, now())
    on conflict (user_id, space) do nothing
  `;
  const rows = (await sql`
    select payload, revision, published_revision, updated_at, published_at
      from public.profile_drafts
     where user_id = ${userId} and space = ${space}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("draft_not_found");
  return {
    payload: (row["payload"] as SerializableDraftPayload | null) ?? (livePayload as SerializableDraftPayload),
    meta: rowMeta(row),
  };
}

/** A standalone QR save publishes only the QR and patches the private draft.
 * Bumping its revision refuses any already-open editor's stale full-prefs write. */
export async function savePublishedProfileQr(userId: string, style: ProfileQrStyle): Promise<void> {
  const encoded = JSON.stringify(style);
  const results = await sql.transaction([
    sql`update public.profiles
      set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{qrSettings}', ${encoded}::jsonb, true)
      where id = ${userId} returning id`,
    sql`update public.profile_drafts
      set payload = jsonb_set(payload, '{displayPrefs}',
            coalesce(payload->'displayPrefs', '{}'::jsonb) || jsonb_build_object('qrSettings', ${encoded}::jsonb), true),
          revision = revision + 1,
          published_revision = case when published_revision = revision then revision + 1 else published_revision end,
          updated_at = now()
      where user_id = ${userId}`,
    // Alias profiles (/u/handle) keep their own display_prefs; the profile QR applies to both.
    sql`update public.alias_profiles
      set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{qrSettings}', ${encoded}::jsonb, true),
          updated_at = now()
      where user_id = ${userId}`,
  ]);
  if (!results[0]?.length) throw new Error("profile_not_found");
}

export async function saveProfileDraft(
  userId: string,
  space: ProfileSpace,
  payload: ProfileDraftPayload,
  expectedRevision: number,
): Promise<DraftMeta> {
  try {
    const rows = (await sql.query(
      `select * from public.save_profile_draft($1::uuid, $2::text, $3::jsonb, $4::bigint)`,
      [userId, space, JSON.stringify(payload), expectedRevision],
    )) as Row[];
    const row = rows[0];
    if (!row) throw new Error("draft_save_failed");
    return rowMeta(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("draft_conflict")) throw new Error("draft_conflict");
    throw error;
  }
}

/**
 * Atomic section merge (0160): only the given fields and display-pref keys
 * change; everything else in the draft stays as stored. No revision guard —
 * disjoint sections commute, and the new revision is returned for publish.
 */
export async function patchProfileDraft(
  userId: string,
  space: ProfileSpace,
  patch: { fields?: Record<string, unknown>; prefs?: Record<string, unknown>; dropPrefs?: string[] },
): Promise<DraftMeta> {
  const rows = (await sql.query(
    `select * from public.patch_profile_draft($1::uuid, $2::text, $3::jsonb, $4::jsonb, array(select jsonb_array_elements_text($5::jsonb)))`,
    [userId, space, JSON.stringify(patch.fields ?? {}), JSON.stringify(patch.prefs ?? {}), JSON.stringify(patch.dropPrefs ?? [])],
  )) as Row[];
  const row = rows[0];
  if (!row) throw new Error("draft_save_failed");
  return rowMeta(row);
}

export async function publishProfileDraft(
  userId: string,
  space: ProfileSpace,
  expectedRevision: number,
): Promise<DraftMeta> {
  try {
    const rows = (await sql.query(
      `select * from public.publish_profile_draft($1::uuid, $2::text, $3::bigint)`,
      [userId, space, expectedRevision],
    )) as Row[];
    const row = rows[0];
    if (!row) throw new Error("publish_failed");
    return rowMeta(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("draft_conflict")) throw new Error("draft_conflict");
    throw error;
  }
}

export async function discardProfileDraft(
  userId: string,
  space: ProfileSpace,
  livePayload: ProfileDraftPayload,
  expectedRevision: number,
): Promise<{ payload: SerializableDraftPayload; meta: DraftMeta }> {
  const saved = await saveProfileDraft(userId, space, livePayload, expectedRevision);
  const rows = (await sql`
    update public.profile_drafts
       set published_revision = revision, published_at = now(), updated_at = now()
     where user_id = ${userId} and space = ${space} and revision = ${saved.draftRevision}
     returning payload, revision, published_revision, updated_at, published_at
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("draft_conflict");
  return { payload: (row["payload"] as SerializableDraftPayload) ?? (livePayload as SerializableDraftPayload), meta: rowMeta(row) };
}
/** Current revision + stored QR settings, used to rebase an editor after a conflict. */
export async function readDraftHead(
  userId: string,
  space: ProfileSpace,
): Promise<{ currentRevision: number; qrSettingsJson: string | null } | null> {
  const rows = (await sql`
    select revision, payload->'displayPrefs'->'qrSettings' as qr
      from public.profile_drafts where user_id = ${userId} and space = ${space}
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return { currentRevision: Number(row["revision"] ?? 0), qrSettingsJson: row["qr"] == null ? null : JSON.stringify(row["qr"]) };
}

/** Turns the anonymous ask page on live (and in the private draft), like the QR save. */
export async function publishAskPageOn(userId: string): Promise<void> {
  const patch = JSON.stringify({ questionsEnabled: true, qaPage: true });
  const results = await sql.transaction([
    sql`update public.profiles
      set display_prefs = coalesce(display_prefs, '{}'::jsonb) || ${patch}::jsonb
      where id = ${userId} returning id`,
    sql`update public.profile_drafts
      set payload = jsonb_set(payload, '{displayPrefs}', coalesce(payload->'displayPrefs', '{}'::jsonb) || ${patch}::jsonb, true),
          revision = revision + 1,
          published_revision = case when published_revision = revision then revision + 1 else published_revision end,
          updated_at = now()
      where user_id = ${userId}`,
  ]);
  if (!results[0]?.length) throw new Error("profile_not_found");
}
