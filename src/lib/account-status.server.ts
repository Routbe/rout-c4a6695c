import { sql } from "@/lib/neon";

/**
 * Self-service account freeze.
 *
 * A frozen account keeps all of its data: the public profile shows a neutral
 * "paused" notice and short links / QR redirects stop resolving. Signing in
 * lifts the freeze automatically (see `reactivateOnSignIn`).
 */

export type AccountStatus = "active" | "frozen" | "suspended" | "banned";

export async function setAccountStatus(userId: string, status: "active" | "frozen") {
  const rows = (await sql`
    update public.profiles
       set status = ${status}, updated_at = now()
     where id = ${userId}
       and status in ('active', 'frozen')
    returning id
  `) as { id?: string }[];

  // Only notify when the row actually changed state — a suspended or banned
  // account is untouched by self-service freeze and must stay silent.
  if (rows.length > 0) {
    try {
      const { notifyUser } = await import("./notifications.server");
      await notifyUser(userId, status === "frozen" ? "account_frozen" : "account_unfrozen", {
        status,
      });
    } catch (error) {
      console.error("[account-status] notify failed", error);
    }
  }

  return status;
}

export async function readAccountStatus(userId: string): Promise<AccountStatus> {
  const rows = (await sql`
    select status from public.profiles where id = ${userId} limit 1
  `) as { status?: string }[];
  return ((rows[0]?.status as AccountStatus | undefined) ?? "active") as AccountStatus;
}

/** Called from every successful sign-in: a returning member is never frozen. */
export async function reactivateOnSignIn(userId: string) {
  try {
    const rows = (await sql`
      update public.profiles
         set status = 'active', updated_at = now()
       where id = ${userId} and status = 'frozen'
      returning id
    `) as { id?: string }[];
    if (rows.length > 0) {
      const { notifyUser } = await import("./notifications.server");
      await notifyUser(userId, "account_unfrozen", { via: "sign_in" });
    }
  } catch {
    /* never block a sign-in on the un-freeze */
  }
}
