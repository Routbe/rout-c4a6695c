/**
 * Server-only helper that transfers the sign-up form fields (full name and
 * requested handle) from the auth user's metadata onto their profile row.
 *
 * The database trigger only knows how to invent a handle; anything the member
 * actually typed lives in `user_metadata` and would otherwise be lost. This
 * always scopes writes to the signed-in member's own profile row.
 */
import { sql } from "@/lib/neon";
import { RESERVED_SLUGS } from "./reserved-slugs";

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

const RESERVED = RESERVED_SLUGS;

function normalizeHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function isUsableHandle(handle: string) {
  return (
    // 3–4 characters are reserved for admin VIP grants: never auto-applied here.
    // Free sign-up tier: 5+ characters AND at least one digit.
    handle.length >= 5 &&
    /[0-9]/.test(handle) &&
    handle.length <= 120 &&
    HANDLE_PATTERN.test(handle) &&
    !RESERVED.has(handle)
  );
}

export type SignupProfileResult = {
  ok: boolean;
  applied: boolean;
  handle?: string | null;
  reason?: string;
};

type Row = Record<string, unknown>;

export async function applySignupProfile(
  userId: string,
  metadata: Record<string, unknown>,
): Promise<SignupProfileResult> {
  // Google sends full_name/name plus given_name/family_name; GitHub sends
  // name (and sometimes only a login). Compose whatever is available.
  const rawName = metadata["full_name"] ?? metadata["name"];
  const first = typeof metadata["given_name"] === "string" ? metadata["given_name"].trim() : "";
  const last = typeof metadata["family_name"] === "string" ? metadata["family_name"].trim() : "";
  const composed = [first, last].filter(Boolean).join(" ");
  const fullName = (typeof rawName === "string" ? rawName.trim() : "") || composed;
  const requested = normalizeHandle(metadata["handle"] ?? metadata["username"]);
  // Google sends `picture`, GitHub sends `avatar_url`.
  const rawAvatar = metadata["avatar_url"] ?? metadata["picture"];
  const avatarUrl =
    typeof rawAvatar === "string" && /^https:\/\//.test(rawAvatar.trim()) ? rawAvatar.trim() : "";

  const rows = (await sql`
    select username, display_name, avatar_url from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const profile = rows[0] as
    | { username?: string | null; display_name?: string | null; avatar_url?: string | null }
    | undefined;

  const patch: Record<string, string> = {};

  if (fullName && !profile?.display_name) patch["display_name"] = fullName;
  if (avatarUrl && !profile?.avatar_url) patch["avatar_url"] = avatarUrl;

  let nextUsername: string | null = null;
  if (requested && isUsableHandle(requested) && profile?.username !== requested) {
    const taken = (await sql`
      select id from public.profiles where username = ${requested} limit 1
    `) as Row[];
    if (!taken.length) {
      patch["username"] = requested;
      nextUsername = requested;
    }
  }

  // Elk nieuw lid krijgt meteen een werkende gratis pagina op /u/<handle>.
  // Koos het lid zelf geen naam (of sloeg het de stap over), dan levert de
  // generator een vrije naam die aan de gratis regel voldoet.
  const ensureAlias = async (preferred: string | null) => {
    const { ensureFreeAliasProfile } = await import("./alias-profile.server");
    await ensureFreeAliasProfile(userId, { preferred, seed: fullName || preferred });
  };

  if (Object.keys(patch).length === 0) {
    await ensureAlias(requested || profile?.username || null);
    return { ok: true, applied: false, handle: profile?.username ?? null };
  }

  try {
    await sql`
      insert into public.profiles (id, username, display_name, avatar_url, updated_at)
      values (
        ${userId},
        ${nextUsername ?? profile?.username ?? null},
        ${patch["display_name"] ?? profile?.display_name ?? null},
        ${patch["avatar_url"] ?? profile?.avatar_url ?? null},
        now()
      )
      on conflict (id) do update set
        username = excluded.username,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "update_failed";
    return { ok: false, applied: false, reason: message };
  }

  return { ok: true, applied: true, handle: nextUsername ?? profile?.username ?? null };
}
