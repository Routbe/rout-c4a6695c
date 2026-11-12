import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { sql } from "@/lib/neon";
import { isMissingColumnError, withoutColumns } from "@/lib/optional-columns";

type Row = Record<string, unknown>;

type AccountRow = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  tier?: string | null;
  status?: string | null;
  verified?: boolean | null;
  verified_at?: string | null;
  is_early_believer?: boolean | null;
  is_paid?: boolean | null;
  show_email_publicly?: boolean | null;
  forwarding_email?: string | null;
  forwarding_email_verified?: boolean | null;
  bluesky_did?: string | null;
  roles?: string[] | null;
};

type ProfileEditorRow = {
  username?: string | null;
  display_name?: string | null;
  tagline?: string | null;
  avatar_url?: string | null;
  favicon_url?: string | null;
  theme?: string | null;
  card_style?: string | null;
  blocks?: unknown;
  verified?: boolean | null;
  status?: string | null;
  verified_legal_name?: string | null;
};

function describeDbError(error: unknown) {
  const e = (error ?? {}) as Record<string, unknown>;
  return {
    message: typeof e["message"] === "string" ? e["message"] : String(error),
    code: e["code"] ?? null,
  };
}

/**
 * Neon equivalent of the old `public.get_my_account()` RPC: the caller's own
 * profile row joined with their roles. Always scoped to `context.userId`.
 */
async function loadAccount(userId: string): Promise<AccountRow | null> {
  const rows = (await sql`
    select
      p.id, p.email, p.username, p.display_name, p.avatar_url, p.tier, p.status,
      p.verified, p.verified_at, p.is_early_believer, p.is_paid, p.show_email_publicly,
      p.forwarding_email, p.forwarding_email_verified, p.bluesky_did,
      coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}') as roles
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    where p.id = ${userId}
    group by p.id
  `) as Row[];
  return (rows[0] as AccountRow | undefined) ?? null;
}

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    let account: AccountRow | null;
    try {
      account = await loadAccount(context.userId);
    } catch (error) {
      const info = describeDbError(error);
      console.error("[account:get_my_account:failed]", { userId: context.userId, ...info });
      throw new Error(`account_unavailable: ${info.code ?? "unknown"} ${info.message}`);
    }

    if (!account) {
      const email = context.user?.email ?? null;
      await sql`
        insert into public.profiles (id, email)
        values (${context.userId}, ${email ? email.toLowerCase() : null})
        on conflict (id) do nothing
      `;
      await sql`
        insert into public.user_roles (user_id, role)
        values (${context.userId}, 'user')
        on conflict (user_id, role) do nothing
      `;
      account = await loadAccount(context.userId);
    }

    if (!account) {
      console.error("[account:get_my_account:empty]", {
        userId: context.userId,
        note: "no row even after profile/user_roles upsert",
      });
      throw new Error("account_unavailable: no row returned");
    }

    return {
      id: account.id ?? context.userId,
      email: account.email ?? null,
      username: account.username ?? null,
      displayName: account.display_name ?? null,
      avatarUrl: account.avatar_url ?? null,
      tier: account.tier ?? "free",
      status: account.status ?? "active",
      verified: Boolean(account.verified),
      verifiedAt: account.verified_at ?? null,
      isEarlyBeliever: Boolean(account.is_early_believer),
      isPaid: Boolean(account.is_paid),
      showEmailPublicly: Boolean(account.show_email_publicly),
      forwardingEmail: account.forwarding_email ?? null,
      forwardingEmailVerified: Boolean(account.forwarding_email_verified),
      blueskyDid: account.bluesky_did ?? null,
      roles: account.roles ?? [],
    };
  });

const PROFILE_EDITOR_COLUMNS =
  "username,display_name,tagline,avatar_url,favicon_url,theme,card_style,blocks,verified,status,verified_legal_name";

async function loadProfileEditor(userId: string, columns: string): Promise<Row | null> {
  const rows = (await sql`
    select ${sql.unsafe(columns)} from public.profiles where id = ${userId} limit 1
  `) as Row[];
  return rows[0] ?? null;
}

export const getMyProfileEditor = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const startedAt = Date.now();
    console.info("[profile-editor:load:start]", { userId: context.userId });

    let profile: Row | null;
    try {
      profile = await loadProfileEditor(context.userId, PROFILE_EDITOR_COLUMNS);
    } catch (error) {
      if (!isMissingColumnError(error)) {
        const info = describeDbError(error);
        console.error("[profile-editor:load:failed]", {
          userId: context.userId,
          durationMs: Date.now() - startedAt,
          table: "profiles",
          ...info,
        });
        throw new Error(`profile_unavailable: ${info.code ?? "unknown"} ${info.message}`);
      }
      profile = await loadProfileEditor(context.userId, withoutColumns(PROFILE_EDITOR_COLUMNS));
    }

    console.info("[profile-editor:load:done]", {
      userId: context.userId,
      durationMs: Date.now() - startedAt,
      found: Boolean(profile),
    });
    if (!profile) return null;

    const row = profile as ProfileEditorRow;
    return {
      username: row.username ?? null,
      displayName: row.display_name ?? null,
      tagline: row.tagline ?? null,
      avatarUrl: row.avatar_url ?? null,
      faviconUrl: row.favicon_url ?? null,
      theme: row.theme ?? "noir",
      cardStyle: row.card_style ?? "bordered",
      blocks: Array.isArray(row.blocks) ? row.blocks : [],
      verified: Boolean(row.verified),
      status: row.status ?? "active",
      verifiedLegalName: row.verified_legal_name ?? null,
    };
  });
