/** Server-only workspace access. Every role decision is made here, never in the browser. */
import { sql } from "@/lib/neon";
import { inviteTargetLabel, isWorkspaceRole, parseInviteTarget, type WorkspaceRole } from "./workspace-rules";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** The caller's role in a workspace, or null when they are not a member. */
export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  if (!isUuid(workspaceId)) return null;
  const rows = (await sql`
    select role::text as role from public.workspace_members
    where workspace_id = ${workspaceId} and user_id = ${userId} limit 1
  `) as { role: string }[];
  const role = rows[0]?.role;
  return isWorkspaceRole(role) ? role : null;
}

/** Throws Forbidden unless the user holds one of the allowed roles in the workspace. */
export async function assertWorkspaceRole(userId: string, workspaceId: string, allowed: readonly WorkspaceRole[]): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role || !allowed.includes(role)) throw new Error("Forbidden");
  return role;
}

/**
 * Active context from the cookie. A missing, malformed or no-longer-valid
 * membership falls back to the personal context (workspaceId null).
 */
export async function resolveActiveWorkspace(userId: string): Promise<{ workspaceId: string | null; role: WorkspaceRole | null }> {
  const { readRequestCookie } = await import("@/lib/request-context");
  const raw = readRequestCookie(ACTIVE_WORKSPACE_COOKIE);
  if (!isUuid(raw)) return { workspaceId: null, role: null };
  const role = await getWorkspaceRole(userId, raw);
  return role ? { workspaceId: raw, role } : { workspaceId: null, role: null };
}

export async function setActiveWorkspaceCookie(workspaceId: string | null) {
  const { writeResponseCookie: setCookie, clearResponseCookie } = await import("@/lib/request-context");
  if (!workspaceId) {
    clearResponseCookie(ACTIVE_WORKSPACE_COOKIE, { path: "/" });
    return;
  }
  setCookie(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180,
  });
}

export async function countOwners(workspaceId: string): Promise<number> {
  const rows = (await sql`
    select count(*)::int as n from public.workspace_members where workspace_id = ${workspaceId} and role = 'owner'
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export type ResolvedInvite = { email: string; userId: string | null; role: string; label: string };

/** Turns e-mail / @username invite fields into stored invites. Unknown usernames are refused; the caller is skipped. */
export async function resolveInvites(list: { target: string; role: string }[], selfId: string): Promise<ResolvedInvite[]> {
  const out: ResolvedInvite[] = [];
  for (const item of list) {
    const t = parseInviteTarget(item.target);
    if (!t) throw new Error(`"${item.target}" is geen geldig e-mailadres of @gebruikersnaam.`);
    const found = ((await sql`select user_id, email from public.rout_resolve_account(${t.value})`) as { user_id: string; email: string }[])[0];
    if (t.kind === "username" && !found) throw new Error(`Geen ROUT-account gevonden met ${inviteTargetLabel(t)}.`);
    if (found?.user_id === selfId) continue;
    const email = (found?.email ?? t.value).toLowerCase();
    if (out.some((o) => o.email === email)) continue;
    out.push({ email, userId: t.kind === "username" ? found!.user_id : null, role: item.role, label: inviteTargetLabel(t) });
  }
  return out;
}
