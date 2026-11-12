import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { sql } from "@/lib/neon";

/**
 * Persists the sign-up form fields (full name, requested handle) that arrived
 * as auth metadata onto the member's profile row. Safe to call repeatedly: it
 * never overwrites a display name or handle that is already set.
 */
export const syncSignupProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const metadata = (context.user?.userMetadata ?? {}) as Record<string, unknown>;
    if (metadata["signup_profile_applied"] === true) {
      return { ok: true as const, applied: false as const };
    }
    const { applySignupProfile } = await import("./signup-profile.server");
    return applySignupProfile(context.userId, metadata);
  });

type Row = Record<string, unknown>;

/**
 * Ensures the OAuth avatar (Google / GitHub) is stored on the profile row so it
 * shows up in the app and on the public profile page. Never overwrites an
 * avatar the member uploaded themselves.
 */
export const syncOAuthAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const meta = (context.user?.userMetadata ?? {}) as Record<string, unknown>;
    const raw = meta["avatar_url"] ?? meta["picture"];
    const avatarUrl = typeof raw === "string" && /^https:\/\//.test(raw.trim()) ? raw.trim() : "";
    if (!avatarUrl) return { ok: true as const, applied: false as const };

    const rows = (await sql`
      select avatar_url from public.profiles where id = ${context.userId} limit 1
    `) as Row[];
    if (rows[0]?.["avatar_url"] as string | null | undefined) {
      return { ok: true as const, applied: false as const };
    }

    try {
      await sql`
        insert into public.profiles (id, avatar_url, updated_at)
        values (${context.userId}, ${avatarUrl}, now())
        on conflict (id) do update set avatar_url = excluded.avatar_url, updated_at = now()
      `;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "update_failed";
      return { ok: false as const, applied: false as const, reason };
    }
    return { ok: true as const, applied: true as const };
  });

/** Used by the first-run name dialog: read the caller's own display name. */
export const getMyDisplayName = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = (await sql`
      select display_name from public.profiles where id = ${context.userId} limit 1
    `) as Row[];
    return { displayName: (rows[0]?.["display_name"] as string | null) ?? null };
  });

/** Sets the display name once, from the first-run onboarding dialog. */
export const setMyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { displayName: string }) => input)
  .handler(async ({ data, context }) => {
    await sql`
      insert into public.profiles (id, display_name, updated_at)
      values (${context.userId}, ${data.displayName}, now())
      on conflict (id) do update set display_name = excluded.display_name, updated_at = now()
    `;
    return { ok: true as const };
  });
