import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { parseTourDraft, type TourDraft } from "@/lib/tour-draft";

/**
 * Bewaart het rondleiding-concept op e-mailadres, zodat een magic-link login op
 * een ander toestel alle stappen terugvindt. Alleen de ingelogde eigenaar
 * van dat adres kan schrijven en teruglezen.
 */
export const saveTourDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { draft: unknown }) => input)
  .handler(async ({ data, context }) => {
    // Signed-in only: the draft is always stored under the session's own email.
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, reason: "invalid_email" };
    }
    const { upsertTourDraft } = await import("@/lib/tour-draft.server");
    return upsertTourDraft(email, parseTourDraft(data.draft));
  });

/** Haalt het concept van de ingelogde gebruiker op (op basis van sessie-e-mail). */
export const getMyTourDraft = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (!email) return { draft: null as TourDraft | null };
    const { readTourDraft } = await import("@/lib/tour-draft.server");
    return { draft: await readTourDraft(email) };
  });

/** Ruimt het concept op zodra het profiel echt is aangemaakt. */
export const discardMyTourDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (email) {
      const { deleteTourDraft } = await import("@/lib/tour-draft.server");
      await deleteTourDraft(email);
    }
    return { ok: true as const };
  });

/**
 * Anonieme concepten hangen aan een door de server uitgegeven, willekeurig
 * token dat uitsluitend in een HttpOnly-cookie leeft. Een door de client
 * meegestuurd token wordt genegeerd: zo kan niemand het concept van een andere
 * bezoeker overschrijven, uitlezen of wissen door een token te kiezen of te raden.
 */
const DRAFT_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;
const DRAFT_TOKEN_RE = /^[0-9a-f]{64}$/;

async function draftCookie() {
  const { TOUR_DRAFT_COOKIE } = await import("@/lib/auth/post-auth");
  const { readRequestCookie, writeResponseCookie, clearResponseCookie } = await import("@/lib/request-context");
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: DRAFT_COOKIE_MAX_AGE_S };
  return {
    read(): string | null {
      const raw = readRequestCookie(TOUR_DRAFT_COOKIE) ?? "";
      return DRAFT_TOKEN_RE.test(raw) ? raw : null;
    },
    /** Existing cookie token, or a fresh 256-bit one (cookie refreshed either way). */
    ensure(): string {
      const existing = this.read();
      const token =
        existing ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      writeResponseCookie(TOUR_DRAFT_COOKIE, token, opts);
      return token;
    },
    clear() {
      clearResponseCookie(TOUR_DRAFT_COOKIE, { path: "/" });
    },
  };
}

/**
 * Anoniem opslaan tijdens de rondleiding: er is nog geen account, dus het
 * concept hangt aan het cookie-token van deze browser. Zo staat elke keuze al
 * in Neon vóór de eerste login.
 */
export const saveTourDraftToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string; draft: unknown }) => ({ draft: input?.draft }))
  .handler(async ({ data }) => {
    const token = (await draftCookie()).ensure();
    const { upsertTourDraftByToken } = await import("@/lib/tour-draft.server");
    return upsertTourDraftByToken(token, parseTourDraft(data.draft));
  });

/** Haalt het anonieme concept van deze browser op (cookie-token). */
export const getTourDraftByToken = createServerFn({ method: "POST" })
  .inputValidator((_input?: { token?: string }) => ({}))
  .handler(async () => {
    const token = (await draftCookie()).read();
    if (!token) return { draft: null as TourDraft | null };
    const { readTourDraftByToken } = await import("@/lib/tour-draft.server");
    return { draft: await readTourDraftByToken(token) };
  });

/** Ruimt het anonieme concept van deze browser op zodra het profiel echt is aangemaakt. */
export const discardTourDraftToken = createServerFn({ method: "POST" })
  .inputValidator((_input?: { token?: string }) => ({}))
  .handler(async () => {
    const cookie = await draftCookie();
    const token = cookie.read();
    if (token) {
      const { deleteTourDraftByToken } = await import("@/lib/tour-draft.server");
      await deleteTourDraftByToken(token);
      cookie.clear();
    }
    return { ok: true as const };
  });

/**
 * Start van elke aanmelding: legt het concept-token en de bestemming vast in
 * HttpOnly-cookies, zodat er niets in de URL hoeft (het token zelf komt altijd van de server). `/auth/continue` leest ze
 * na de login uit en stuurt in één 303 door.
 */
export const beginAuthIntent = createServerFn({ method: "POST" })
  .inputValidator((input: { draftToken?: string; next?: string }) => ({
    draftToken: typeof input?.draftToken === "string" && input.draftToken.length > 0 ? "1" : undefined,
    next: typeof input?.next === "string" ? input.next : undefined,
  }))
  .handler(async ({ data }) => {
    const { writeResponseCookie } = await import("@/lib/request-context");
    const { NEXT_COOKIE, safeNextPath } = await import("@/lib/auth/post-auth");
    const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 };
    // The draft token is never taken from the client: only an existing,
    // server-issued cookie token is kept (and refreshed) for /auth/continue.
    if (data.draftToken) (await draftCookie()).ensure();
    const next = safeNextPath(data.next ?? null);
    if (next) writeResponseCookie(NEXT_COOKIE, next, opts);
    return { ok: true as const };
  });
