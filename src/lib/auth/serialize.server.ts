import { readRequestHeader as getRequestHeader } from "@/lib/request-context";
import type { SessionUser } from "./session.server";

/** Server-side session record → the snake_case shape the UI consumes. */
export function toAuthUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.emailConfirmedAt,
    user_metadata: user.userMetadata,
    app_metadata: user.appMetadata,
    created_at: user.createdAt,
    last_sign_in_at: user.lastSignInAt,
  };
}

/** Absolute origin of the current request, used to build e-mail links. */
export function originFromRequest(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = getRequestHeader("host") ?? "rout.be";
  const proto =
    getRequestHeader("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
