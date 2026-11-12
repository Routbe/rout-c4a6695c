import { getBridgedUser } from "@/lib/auth/bridge.server";

/**
 * Session resolution for ROUT.
 *
 * There is no extra session store: Better Auth owns sign-in,
 * sign-up and the session cookie (self-hosted Better Auth). This module only turns that session into the
 * `public.users` record the rest of the app has always worked with, so every
 * foreign key (QR codes, domains, statistics) keeps resolving unchanged.
 */

export type SessionUser = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  userMetadata: Record<string, unknown>;
  appMetadata: Record<string, unknown>;
  createdAt: string;
  lastSignInAt: string | null;
};

type Row = Record<string, unknown>;

export function toSessionUser(row: Row): SessionUser {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    emailConfirmedAt: (row["email_confirmed_at"] as string | null) ?? null,
    userMetadata: (row["user_metadata"] as Record<string, unknown> | null) ?? {},
    appMetadata: (row["app_metadata"] as Record<string, unknown> | null) ?? {},
    createdAt: row["created_at"] as string,
    lastSignInAt: (row["last_sign_in_at"] as string | null) ?? null,
  };
}

/**
 * The signed-in member for the in-flight request, or null when signed out.
 *
 * Passkey-only: Better Auth is the ONLY door, and only for members that own a
 * passkey (bridge.server.ts). Legacy app-session cookies from the former
 * Bluesky/Mastodon sign-in are no longer honoured.
 */
export async function currentUser(): Promise<SessionUser | null> {
  return getBridgedUser();
}
