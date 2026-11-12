import { createFileRoute } from "@tanstack/react-router";
import {
  postAuthDestination,
  NEXT_COOKIE,
  SIGN_IN_PATH,
  TOUR_DRAFT_COOKIE,
  cleanAuthError,
  safeNextPath,
} from "@/lib/auth/post-auth";
import { appMode } from "@/lib/app-mode";

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

function seeOther(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

const clearNext = `${NEXT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
const clearDraft = `${TOUR_DRAFT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;

/**
 * Single landing point after every sign-in (OAuth, magic link, password,
 * Bluesky, Mastodon). Resolves the session server-side and answers with one
 * 303 to a clean destination — no tokens or flags ever reach the final URL.
 */
export async function handlePostAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    console.warn("[auth] post-auth error", { error });
    return seeOther(`${SIGN_IN_PATH}?error=${cleanAuthError(error)}`, [clearNext]);
  }

  const { currentUser } = await import("@/lib/auth/session.server");
  const user = await currentUser().catch((err) => {
    console.error("[auth] post-auth session lookup failed", err);
    return null;
  });
  if (!user) return seeOther(`${SIGN_IN_PATH}?error=session_missing`, [clearNext]);

  const cookieHeader = request.headers.get("cookie");
  const draftToken = readCookie(cookieHeader, TOUR_DRAFT_COOKIE);
  let next = safeNextPath(readCookie(cookieHeader, NEXT_COOKIE)) ?? null;
  const mode = appMode();

  // A pending tour draft is applied straight to a new account; existing members keep their profile.
  if (draftToken && mode !== "admin") {
    let result: "applied" | "handle_taken" | "skipped" = "handle_taken";
    try {
      const { readTourDraftByToken, upsertTourDraft, deleteTourDraftByToken, deleteTourDraft } =
        await import("@/lib/tour-draft.server");
      const { applyTourDraftToUser } = await import("@/lib/tour-draft-apply.server");
      const token = decodeURIComponent(draftToken);
      const draft = await readTourDraftByToken(token);
      const email = user.email?.trim().toLowerCase() ?? "";
      if (draft) {
        result = await applyTourDraftToUser(user.id, draft);
        if (result === "handle_taken" && email) await upsertTourDraft(email, draft);
        else if (email) await deleteTourDraft(email);
        await deleteTourDraftByToken(token);
      } else {
        result = "skipped";
      }
    } catch (err) {
      console.error("[auth] post-auth draft apply failed", err);
    }
    if (result === "handle_taken") next = "/onboarding";
    else if (result === "applied") next = "/studio";
  }

  return seeOther(postAuthDestination(mode, next), draftToken ? [clearNext, clearDraft] : [clearNext]);
}

export const Route = createFileRoute("/auth_/continue")({
  server: {
    handlers: {
      GET: ({ request }) => handlePostAuth(request),
    },
  },
});
