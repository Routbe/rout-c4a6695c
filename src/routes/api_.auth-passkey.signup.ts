import { createFileRoute } from "@tanstack/react-router";

/**
 * Passkey-first sign-up, step 1: checks consent, birth date, e-mail and an
 * ALTCHA proof, then returns a short-lived signed ticket. Step 2 is the WebAuthn
 * registration with that ticket as `context`; only a verified passkey creates
 * the account (passkey-enrollment.server.ts). No password, no e-mail link.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api_/auth-passkey/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { appMode } = await import("@/lib/app-mode");
        if (appMode() === "admin") return Response.json({ code: "signup_disabled", message: "Aanmelden kan niet op het beheerportaal." }, { status: 403, headers: noStore });
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const email = typeof body?.["email"] === "string" ? body["email"].trim().toLowerCase() : "";
        const name = typeof body?.["name"] === "string" ? body["name"].trim().slice(0, 80) : "";
        const dob = typeof body?.["dob"] === "string" ? body["dob"] : "";
        const parentEmail = typeof body?.["parentEmail"] === "string" ? body["parentEmail"].trim().toLowerCase() : "";
        const { SIGNUP_CONSENT_VERSION } = await import("@/lib/signup-consent");
        if (body?.["consent"] !== SIGNUP_CONSENT_VERSION) {
          return Response.json({ code: "consent_required", message: "Ga akkoord met de Algemene Voorwaarden en het Privacybeleid en bevestig dat je 16 jaar of ouder bent." }, { status: 400, headers: noStore });
        }
        if (!EMAIL.test(email) || email.length > 254) return Response.json({ code: "email_invalid", message: "Vul een geldig e-mailadres in." }, { status: 400, headers: noStore });
        const { signupAgeProblem, isMinorDob } = await import("@/lib/minor-safety");
        const problem = signupAgeProblem({ dob, parentEmail, email });
        if (problem) {
          return Response.json({ code: problem, message: problem === "dob_invalid" ? "Vul een geldige geboortedatum in." : "Vul het e-mailadres van je ouder of voogd in (niet je eigen adres)." }, { status: 400, headers: noStore });
        }

        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
        const limit = await hitRateLimit("auth", `${clientIp(request)}:/passkey-signup`, RATE_RULES.authAttempt);
        if (!limit.ok) return tooManyRequests(limit.retryAfter);
        const { verifyAltcha, identityNeedsHardChallenge, throttleHashForEmail } = await import("@/lib/altcha.server");
        const altcha = await verifyAltcha(request.headers.get("x-altcha"), { requireHard: await identityNeedsHardChallenge(throttleHashForEmail(email)) });
        if (!altcha.ok) {
          return Response.json({ code: "altcha_invalid", reason: altcha.reason, message: "Botcontrole mislukt. Probeer het opnieuw." }, { status: altcha.reason === "store_unavailable" ? 503 : 400, headers: noStore });
        }

        const { resolveAuthSecret } = await import("@/lib/better-auth.server");
        const secret = resolveAuthSecret()?.secret;
        if (!secret) return Response.json({ code: "missing_secret", message: "Aanmelden is tijdelijk niet beschikbaar." }, { status: 503, headers: noStore });
        const { signSignupTicket } = await import("@/lib/auth/signup-ticket");
        const ticket = await signSignupTicket(
          secret,
          { email, name, dob, parentEmail: isMinorDob(dob) ? parentEmail : null, consent: SIGNUP_CONSENT_VERSION },
          Math.floor(Date.now() / 1000),
        );
        return Response.json({ ticket }, { headers: noStore });
      },
    },
  },
});
