import { sql } from "@/lib/neon";

/**
 * Linked sign-in identities: fediverse rows in `public.user_identities` plus
 * Better Auth provider accounts in `neon_auth.account` (ids prefixed `ba:`).
 *
 * Multiple accounts per provider are supported — a member can attach both a
 * personal and a work Google account. Unlinking is refused when it would leave
 * the member without any way to sign in.
 */

export type IdentityRow = {
  id: string;
  provider: string;
  providerAccountId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

async function listFediverse(userId: string): Promise<IdentityRow[]> {
  const rows = (await sql`
    select id, provider, provider_account_id, email, display_name, avatar_url, created_at
      from public.user_identities
     where user_id = ${userId}
     order by provider, created_at
  `) as Row[];
  return rows.map((r) => ({
    id: r["id"] as string,
    provider: r["provider"] as string,
    providerAccountId: r["provider_account_id"] as string,
    email: (r["email"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    avatarUrl: (r["avatar_url"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  }));
}

/** Better Auth user id bridged onto this ROUT member (user_metadata.neon_auth_id). */
async function betterAuthId(userId: string): Promise<string | null> {
  const rows = (await sql`
    select user_metadata->>'neon_auth_id' as ba from public.users where id = ${userId} limit 1
  `) as Row[];
  return (rows[0]?.["ba"] as string | null) ?? null;
}

type BaAccount = {
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
  idToken: string | null;
  accessToken: string | null;
};

async function listBetterAuth(userId: string): Promise<BaAccount[]> {
  const ba = await betterAuthId(userId);
  if (!ba) return [];
  try {
    const rows = (await sql`
      select id, "providerId", "accountId", "createdAt", "idToken", "accessToken"
        from neon_auth.account where "userId" = ${ba}
    `) as Row[];
    return rows.map((r) => ({
      id: String(r["id"]),
      providerId: String(r["providerId"]),
      accountId: String(r["accountId"]),
      createdAt: String(r["createdAt"]),
      idToken: (r["idToken"] as string | null) ?? null,
      accessToken: (r["accessToken"] as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Profiel ophalen met het opgeslagen access token (alleen providers zonder bruikbaar id_token). */
async function fetchProfile(provider: string, accessToken: string): Promise<Record<string, unknown> | null> {
  const urls: Record<string, string> = {
    github: "https://api.github.com/user",
    gitlab: `${(process.env["GITLAB_ISSUER"]?.trim() || "https://gitlab.com").replace(/\/+$/, "")}/api/v4/user`,
    infomaniak: "https://login.infomaniak.com/oauth2/userinfo",
  };
  const url = urls[provider];
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "user-agent": "ROUT" },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Leesbare naam per account: uit cache, anders uit id_token of provider-profiel (en cachen). */
async function resolveLabels(accounts: BaAccount[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (accounts.length === 0) return out;
  try {
    const ids = accounts.map((a) => a.id);
    const rows = (await sql`select account_id, label from public.identity_labels where account_id = any(${ids})`) as Row[];
    for (const r of rows) out.set(String(r["account_id"]), String(r["label"]));
  } catch {
    /* tabel nog niet gemigreerd: lui resolven zonder cache */
  }
  const { pickIdentityLabel, decodeJwtPayload } = await import("./identity-label");
  await Promise.all(
    accounts
      .filter((a) => !out.has(a.id))
      .map(async (a) => {
        let label = pickIdentityLabel(a.providerId, decodeJwtPayload(a.idToken));
        if (!label && a.accessToken) label = pickIdentityLabel(a.providerId, await fetchProfile(a.providerId, a.accessToken));
        if (!label) return;
        out.set(a.id, label);
        await sql`insert into public.identity_labels (account_id, provider, label) values (${a.id}, ${a.providerId}, ${label})
          on conflict (account_id) do update set label = excluded.label, updated_at = now()`.catch(() => undefined);
      }),
  );
  return out;
}

export async function listIdentities(userId: string): Promise<IdentityRow[]> {
  const [fedi, ba] = await Promise.all([listFediverse(userId), listBetterAuth(userId)]);
  const labels = await resolveLabels(ba.filter((a) => a.providerId !== "credential"));
  const social = ba
    .filter((a) => a.providerId !== "credential")
    .map((a) => ({
      id: `ba:${a.id}`,
      provider: a.providerId,
      providerAccountId: a.accountId,
      email: labels.get(a.id)?.includes("@") && !labels.get(a.id)!.startsWith("@") ? labels.get(a.id)! : null,
      displayName: labels.get(a.id) ?? null,
      avatarUrl: null,
      createdAt: a.createdAt,
    }));
  return [...social, ...fedi];
}


/** Links a fediverse identity to a member; refuses one that belongs to someone else. */
export async function attachIdentity(input: {
  userId: string;
  provider: string;
  providerAccountId: string;
  displayName?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "taken" }> {
  const owner = (await sql`
    select user_id from public.user_identities
     where provider = ${input.provider} and provider_account_id = ${input.providerAccountId} limit 1
  `) as Row[];
  const current = owner[0]?.["user_id"] as string | undefined;
  if (current && current !== input.userId) return { ok: false, reason: "taken" };
  if (!(await linkIdentity(input))) return { ok: false, reason: "taken" };
  return { ok: true };
}

/** Idempotent upsert used by the OAuth callback for sign-in and for linking. */
export async function linkIdentity(input: {
  userId: string;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const rows = await sql`
    insert into public.user_identities
      (user_id, provider, provider_account_id, email, display_name, avatar_url)
    values (${input.userId}, ${input.provider}, ${input.providerAccountId},
            ${input.email ?? null}, ${input.displayName ?? null}, ${input.avatarUrl ?? null})
    on conflict (provider, provider_account_id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url
      where public.user_identities.user_id = excluded.user_id
    returning id
  `;
  return rows.length > 0;
}

export async function unlinkIdentity(userId: string, identityId: string) {
  const identities = await listIdentities(userId);
  const target = identities.find((i) => i.id === identityId);
  if (!target) return { ok: false as const, reason: "not_found" as const };
  // Linked identities are never a way to sign in (passkey-only), so any of them may be removed.
  if (identityId.startsWith("ba:")) {
    const ba = await betterAuthId(userId);
    if (!ba) return { ok: false as const, reason: "not_found" as const };
    await sql`delete from neon_auth.account where id = ${identityId.slice(3)} and "userId" = ${ba}`;
  } else {
    await sql`delete from public.user_identities where id = ${identityId} and user_id = ${userId}`;
  }
  return { ok: true as const };
}
