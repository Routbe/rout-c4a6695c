import { sql } from "@/lib/neon";
import { canUnsubscribeNotification, signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeHeaders } from "./unsubscribe-token";

async function secret() {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const resolved = resolveAuthSecret();
  if (!resolved) throw new Error("Notification signing not configured");
  return resolved.secret;
}

export async function notificationMailPolicy(userId: string, category?: string, tags?: string[]) {
  if (!canUnsubscribeNotification(category, tags)) return { allowed: true, headers: {} };
  const rows = await sql`select display_prefs->'emailNotifications' as enabled from public.profiles where id = ${userId}`;
  if (rows[0]?.enabled === false) return { allowed: false, headers: {} };
  const token = await signUnsubscribeToken(userId, await secret());
  return { allowed: true, headers: unsubscribeHeaders(process.env["PUBLIC_SITE_URL"] ?? "https://rout.be", token) };
}

export async function unsubscribeNotifications(token: string) {
  const userId = await verifyUnsubscribeToken(token, await secret());
  if (!userId) return false;
  await sql`update public.profiles set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{emailNotifications}', 'false'::jsonb), updated_at = now() where id = ${userId}`;
  return true;
}