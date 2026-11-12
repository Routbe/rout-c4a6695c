import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export type ConnectedApp = {
  clientId: string;
  name: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  scopes: string[];
  grantedAt: string;
};

/** Active "Login met ROUT" consents of the signed-in member. */
export const listConnectedApps = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ConnectedApp[]> => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select g.client_id, c.name, c.logo_url, c.homepage_url, g.scopes, g.granted_at
      from public.oauth_consents g join public.oauth_clients c on c.client_id = g.client_id
      where g.user_id = ${context.userId} and g.revoked_at is null
      order by g.granted_at desc limit 200`) as Record<string, unknown>[];
    return rows.map((r) => ({
      clientId: String(r["client_id"]),
      name: String(r["name"] ?? r["client_id"]),
      logoUrl: (r["logo_url"] as string | null) ?? null,
      homepageUrl: (r["homepage_url"] as string | null) ?? null,
      scopes: (r["scopes"] as string[] | null) ?? [],
      grantedAt: new Date(String(r["granted_at"])).toISOString(),
    }));
  });

/** Revokes the consent and every access/refresh token of that app for this member, atomically. */
export const revokeConnectedApp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ clientId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "app_email_revoke");
    const { sql } = await import("@/lib/neon");
    await sql.transaction([
      sql`update public.oauth_consents set revoked_at = now()
        where user_id = ${context.userId} and client_id = ${data.clientId} and revoked_at is null`,
      sql`update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, now())
        where user_id = ${context.userId} and client_id = ${data.clientId}`,
      sql`update public.oauth_access_tokens set revoked_at = coalesce(revoked_at, now())
        where user_id = ${context.userId} and client_id = ${data.clientId}`,
    ]);
    return { ok: true as const };
  });

export type AppEmailState = {
  clientId: string;
  assignedEmail: string | null;
  choiceId: string;
  options: { id: string; source: "primary" | "alias" | "relay"; email: string }[];
};

/** Per-app email choice for every connected app, plus the apps still on an old address. */
export const listAppEmails = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ primary: string | null; apps: AppEmailState[]; stale: string[] }> => {
    const { sql } = await import("@/lib/neon");
    const { emailOptionsOf, appEmailFor } = await import("./email-broker.server");
    const { staleAssignments } = await import("./backchannel");
    const consents = (await sql`select client_id from public.oauth_consents
      where user_id = ${context.userId} and revoked_at is null and 'email' = any(scopes) limit 200`) as Record<string, unknown>[];
    const rows = (await sql`select client_id, source, assigned_email from public.app_email_assignments
      where user_id = ${context.userId}`) as Record<string, unknown>[];
    const u = ((await sql`select email from public.users where id = ${context.userId} limit 1`) as Record<string, unknown>[])[0];
    const primary = (u?.["email"] as string | null) ?? null;
    const apps: AppEmailState[] = [];
    for (const c of consents) {
      const clientId = String(c["client_id"]);
      const options = await emailOptionsOf(context.userId, clientId).catch(() => []);
      const row = rows.find((r) => r["client_id"] === clientId);
      const current = row ? await appEmailFor(context.userId, clientId).catch(() => null) : null;
      apps.push({
        clientId,
        assignedEmail: (row?.["assigned_email"] as string | null) ?? primary,
        choiceId: current?.id ?? "primary",
        options: options.map((o) => ({ id: o.id, source: o.source, email: o.email })),
      });
    }
    const stale = staleAssignments(
      rows.map((r) => ({ clientId: String(r["client_id"]), source: String(r["source"]), assignedEmail: String(r["assigned_email"]) })),
      primary,
    ).filter((r) => r.source === "primary").map((r) => r.clientId);
    return { primary, apps, stale };
  });

/** Inline choice for one app; notifies the app's back-channel webhook when the address changes. */
export const setAppEmail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ clientId: z.string().min(1).max(200), choiceId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "app_email_reassign");
    const { sql } = await import("@/lib/neon");
    const consent = await sql`select 1 from public.oauth_consents where user_id = ${context.userId} and client_id = ${data.clientId} and revoked_at is null and 'email' = any(scopes) limit 1`;
    if (!consent.length) throw new Error("Deze app is niet verbonden of mag je e-mailadres niet zien.");
    const before = ((await sql`select assigned_email from public.app_email_assignments where user_id = ${context.userId} and client_id = ${data.clientId}`) as Record<string, unknown>[])[0];
    const { assignAppEmail } = await import("./email-broker.server");
    await assignAppEmail(context.userId, data.clientId, data.choiceId);
    const after = ((await sql`select assigned_email from public.app_email_assignments where user_id = ${context.userId} and client_id = ${data.clientId}`) as Record<string, unknown>[])[0];
    const prev = (before?.["assigned_email"] as string | undefined) ?? null;
    const next = (after?.["assigned_email"] as string | undefined) ?? null;
    if (next && prev !== next) {
      const { later } = await import("@/lib/site-mail.server");
      const { dispatchEmailUpdated } = await import("@/lib/auth/email-sync-webhook.server");
      later(() => dispatchEmailUpdated(context.userId, [{ clientId: data.clientId, previousEmail: prev ?? "", newEmail: next }]));
    }
    return { ok: true as const };
  });

/** Bulk wizard: moves the selected apps to the current primary address and notifies them. */
export const bulkUpdateAppEmails = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ clientIds: z.array(z.string().min(1).max(200)).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "app_email_reassign");
    const { sql } = await import("@/lib/neon");
    const { planBulkEmailUpdate } = await import("./backchannel");
    const u = ((await sql`select email from public.users where id = ${context.userId} limit 1`) as Record<string, unknown>[])[0];
    const primary = (u?.["email"] as string | null) ?? null;
    if (!primary) throw new Error("Je account heeft geen primair e-mailadres.");
    const consented = ((await sql`select client_id from public.oauth_consents where user_id = ${context.userId}
      and revoked_at is null and 'email' = any(scopes) and client_id = any(${data.clientIds})`) as Record<string, unknown>[]).map((r) => String(r["client_id"]));
    const rows = (await sql`select client_id, source, assigned_email from public.app_email_assignments
      where user_id = ${context.userId} and client_id = any(${consented})`) as Record<string, unknown>[];
    const known = rows.map((r) => ({ clientId: String(r["client_id"]), source: String(r["source"]), assignedEmail: String(r["assigned_email"]) }));
    // Apps without a row yet get one too (previous address unknown = empty).
    for (const id of consented) if (!known.some((k) => k.clientId === id)) known.push({ clientId: id, source: "primary", assignedEmail: "" });
    const changes = planBulkEmailUpdate(known, consented, primary);
    if (changes.length) {
      await sql.transaction(changes.map((c) => sql`insert into public.app_email_assignments (user_id, client_id, source, alias_id, assigned_email, updated_at)
        values (${context.userId}, ${c.clientId}, 'primary', null, ${c.newEmail}, now())
        on conflict (user_id, client_id) do update set source = 'primary', alias_id = null, assigned_email = excluded.assigned_email, updated_at = now()`));
      const { later } = await import("@/lib/site-mail.server");
      const { dispatchEmailUpdated } = await import("@/lib/auth/email-sync-webhook.server");
      later(() => dispatchEmailUpdated(context.userId, changes.map((c) => ({ ...c, previousEmail: c.previousEmail || "" }))));
    }
    return { updated: changes.length };
  });

export type AppEmailPushResult = {
  clientId: string;
  email: string | null;
  outcome: import("./email-push").PushOutcome;
};

/**
 * "Connect with ROUT" e-mail manager: gives the selected apps one chosen address
 * (`primary`, an alias id, or `relay` = a private relay unique per app), then
 * notifies each app's webhook and reports per app what happened.
 */
export const pushAppEmail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z.object({ choiceId: z.string().min(1).max(64), clientIds: z.array(z.string().min(1).max(200)).min(1).max(200) }).strict().parse(d),
  )
  .handler(async ({ data, context }): Promise<{ results: AppEmailPushResult[] }> => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "app_email_reassign");
    const { sql } = await import("@/lib/neon");
    const { assignAppEmail } = await import("./email-broker.server");
    const { pushOutcome } = await import("./email-push");
    const ids = [...new Set(data.clientIds)];
    const consented = new Set(((await sql`select client_id from public.oauth_consents where user_id = ${context.userId}
      and revoked_at is null and 'email' = any(scopes) and client_id = any(${ids})`) as Record<string, unknown>[]).map((r) => String(r["client_id"])));
    const beforeRows = (await sql`select client_id, assigned_email from public.app_email_assignments
      where user_id = ${context.userId} and client_id = any(${[...consented]})`) as Record<string, unknown>[];
    const before = new Map(beforeRows.map((r) => [String(r["client_id"]), (r["assigned_email"] as string | null) ?? null]));
    const available = new Set<string>();
    for (const clientId of consented) {
      try {
        await assignAppEmail(context.userId, clientId, data.choiceId);
        available.add(clientId);
      } catch {
        // email_choice_unavailable: this app keeps its current address.
      }
    }
    const afterRows = (await sql`select client_id, assigned_email from public.app_email_assignments
      where user_id = ${context.userId} and client_id = any(${[...available]})`) as Record<string, unknown>[];
    const after = new Map(afterRows.map((r) => [String(r["client_id"]), (r["assigned_email"] as string | null) ?? null]));
    const changes = [...available]
      .filter((id) => after.get(id) && (before.get(id) ?? "").toLowerCase() !== String(after.get(id)).toLowerCase())
      .map((id) => ({ clientId: id, previousEmail: before.get(id) ?? "", newEmail: String(after.get(id)) }));
    const { deliverEmailUpdated } = await import("@/lib/auth/email-sync-webhook.server");
    const delivery = await deliverEmailUpdated(context.userId, changes);
    return {
      results: ids.map((clientId) => ({
        clientId,
        email: after.get(clientId) ?? before.get(clientId) ?? null,
        outcome: pushOutcome({
          consented: consented.has(clientId),
          available: available.has(clientId),
          previous: before.get(clientId) ?? null,
          next: after.get(clientId) ?? null,
          delivery: delivery.get(clientId) ?? "none",
        }),
      })),
    };
  });
