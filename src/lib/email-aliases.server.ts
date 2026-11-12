/**
 * Server-only logic for multi-domain e-mail aliases (`handle@rout.be`,
 * `handle@dlp.li`).
 *
 * The rows in `public.email_aliases` are the source of truth; the mail
 * routing provider (ImprovMX today, Cloudflare Email Routing / Infomaniak MX
 * tomorrow) is synced best-effort. Without an API key the alias is stored as
 * `pending` instead of failing the request.
 */
import { sql } from "@/lib/neon";
import { APP_DOMAINS, aliasAddress, cleanHandle, type AppDomain } from "./app-domains";

type Row = Record<string, unknown>;

export type AliasRow = {
  domain: AppDomain;
  address: string;
  forward_to: string;
  status: string;
  sync_error: string | null;
};

export type AliasState = {
  handle: string | null;
  eligible: boolean;
  forwardTo: string | null;
  forwardVerified: boolean;
  domains: AppDomain[];
  aliases: AliasRow[];
};

function improvmxKey(): string | null {
  return process.env["IMPROVMX_API_KEY"] ?? null;
}

/** Creates or updates the alias at the routing provider. Never throws. */
async function syncAlias(
  domain: AppDomain,
  handle: string,
  forward: string,
): Promise<{ status: "active" | "pending" | "failed"; error: string | null }> {
  const key = improvmxKey();
  if (!key) return { status: "pending", error: null };

  const base = `https://api.improvmx.com/v3/domains/${domain}/aliases`;
  const headers = {
    Authorization: `Basic ${btoa(`api:${key}`)}`,
    "Content-Type": "application/json",
  };

  try {
    let res = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ alias: handle, forward }),
    });
    if (res.status === 409) {
      res = await fetch(`${base}/${encodeURIComponent(handle)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ forward }),
      });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "failed", error: detail.slice(0, 300) || `HTTP ${res.status}` };
    }
    return { status: "active", error: null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Unreachable" };
  }
}

async function removeAlias(domain: AppDomain, handle: string): Promise<void> {
  const key = improvmxKey();
  if (!key) return;
  await fetch(
    `https://api.improvmx.com/v3/domains/${domain}/aliases/${encodeURIComponent(handle)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Basic ${btoa(`api:${key}`)}` },
    },
  ).catch(() => undefined);
}

async function readProfile(userId: string) {
  const rows = (await sql`
    select username, verified, is_early_believer, is_paid, forwarding_email, forwarding_email_verified
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Row[];
  const profile = rows[0];
  const eligible = Boolean(
    profile?.["verified"] || profile?.["is_early_believer"] || profile?.["is_paid"],
  );
  return {
    handle: (profile?.["username"] as string | null) ?? null,
    eligible,
    forwardTo: (profile?.["forwarding_email"] as string | null) ?? null,
    forwardVerified: Boolean(profile?.["forwarding_email_verified"]),
  };
}

export async function readAliasState(userId: string): Promise<AliasState> {
  const profile = await readProfile(userId);
  const data = (await sql`
    select domain, forward_to, status, sync_error
      from public.email_aliases
     where user_id = ${userId}
  `) as Row[];

  const rows = data as unknown as {
    domain: AppDomain;
    forward_to: string;
    status: string;
    sync_error: string | null;
  }[];

  const aliases: AliasRow[] = rows.map((row) => ({
    domain: row.domain,
    address: aliasAddress(profile.handle ?? "handle", row.domain),
    forward_to: row.forward_to,
    status: row.status,
    sync_error: row.sync_error,
  }));

  return { ...profile, domains: aliases.map((a) => a.domain), aliases };
}

export type SaveResult =
  | { ok: true; state: AliasState }
  | {
      ok: false;
      reason: "no_handle" | "not_entitled" | "no_forward" | "unconfirmed_forward" | "failed";
      detail?: string;
    };

/**
 * Reconciles the member's alias selection: creates rows for newly picked
 * domains, drops the ones they unchecked, and repoints every remaining alias
 * at the confirmed forwarding inbox.
 */
export async function saveAliasDomains(userId: string, selected: AppDomain[]): Promise<SaveResult> {
  const profile = await readProfile(userId);
  if (!profile.handle) return { ok: false, reason: "no_handle" };
  if (!profile.eligible) return { ok: false, reason: "not_entitled" };

  const handle = cleanHandle(profile.handle);
  const wanted = APP_DOMAINS.filter((d) => selected.includes(d));

  if (wanted.length > 0) {
    if (!profile.forwardTo) return { ok: false, reason: "no_forward" };
    if (!profile.forwardVerified) return { ok: false, reason: "unconfirmed_forward" };
  }

  const dropped = APP_DOMAINS.filter((d) => !wanted.includes(d));
  if (dropped.length > 0) {
    try {
      await sql`
        delete from public.email_aliases
         where user_id = ${userId} and domain = any(${dropped as unknown as string[]})
      `;
    } catch (error) {
      return {
        ok: false,
        reason: "failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    await Promise.all(dropped.map((domain) => removeAlias(domain, handle)));
  }

  for (const domain of wanted) {
    const sync = await syncAlias(domain, handle, profile.forwardTo!);
    try {
      await sql`
        insert into public.email_aliases (user_id, handle, domain, forward_to, status, sync_error, updated_at)
        values (${userId}, ${handle}, ${domain}, ${profile.forwardTo}, ${sync.status}, ${sync.error}, now())
        on conflict (user_id, domain) do update set
          handle = excluded.handle,
          forward_to = excluded.forward_to,
          status = excluded.status,
          sync_error = excluded.sync_error,
          updated_at = now()
      `;
    } catch (error) {
      return {
        ok: false,
        reason: "failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { ok: true, state: await readAliasState(userId) };
}
