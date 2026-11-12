import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { CARD_SCAN_ACTION, allowedStepUpMethods, isCardStepUpAction, type StepUpAction } from "@/lib/auth/step-up-rules";

const actionInput = z.enum(["card_reveal", "card_lifecycle", "card_scan"]).optional();

/** Which methods this account may use for step-up (card actions accept every active factor). */
export const getStepUpOptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ action: actionInput }).strict().optional().parse(d))
  .handler(async ({ data, context }) => {
    const { enrolledFactors } = await import("./step-up.server");
    const f = await enrolledFactors(context.userId);
    const enrolled = { passkey: f.passkey, totp: f.totp, sms: !!f.sms, backup: !!f.backup, password: !!f.password };
    return { methods: allowedStepUpMethods(enrolled, data?.action), enrolled };
  });

export const sendStepUpEmail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { enrolledFactors } = await import("./step-up.server");
    if (!allowedStepUpMethods(await enrolledFactors(context.userId)).includes("email")) {
      throw new Error("Gebruik je passkey of authenticator-app.");
    }
    const { issueSecurityCode } = await import("@/lib/security-code.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    await issueSecurityCode(context.userId, "step_up", getRequest());
    return { ok: true as const };
  });

/** SMS code to the member's verified number; only for ROUT card actions. */
export const sendStepUpSms = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { enrolledFactors } = await import("./step-up.server");
    const f = await enrolledFactors(context.userId);
    if (!f.sms || !f.authUserId) throw new Error("Er is geen bevestigd telefoonnummer voor sms.");
    const { issueSmsSecurityCode } = await import("@/lib/security-code.server");
    const r = await issueSmsSecurityCode(context.userId, f.authUserId);
    if (!r.ok) throw new Error(r.reason === "rate_limited" ? "Te veel codes gevraagd. Probeer het over een kwartier opnieuw." : "De sms kon niet worden verstuurd.");
    return { ok: true as const };
  });

export const completeStepUp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        method: z.enum(["passkey", "totp", "email", "sms", "backup", "password"]),
        code: z.string().regex(/^\d{6}$/).optional(),
        backupCode: z.string().trim().min(6).max(40).regex(/^[A-Za-z0-9-]+$/).optional(),
        password: z.string().min(1).max(256).optional(),
        action: actionInput,
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const action = data.action as StepUpAction | undefined;
    // Card-only factors: SMS, recovery code and password never unlock other actions.
    if ((data.method === "sms" || data.method === "backup" || data.method === "password") && !isCardStepUpAction(action)
      && !(data.method === "sms" && action === CARD_SCAN_ACTION)) {
      throw new Error("Deze verificatiemethode is hier niet toegestaan.");
    }
    if (data.method === "backup" || data.method === "password") {
      const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
      const limit = await hitRateLimit("step-up-secret", context.userId, { limit: 5, windowSec: 15 * 60 }, { failClosed: true });
      if (!limit.ok) throw new Error("Te veel pogingen. Probeer het over een kwartier opnieuw.");
    }
    if (data.method === "email") {
      const { consumeSecurityCode } = await import("@/lib/security-code.server");
      if (!data.code || !(await consumeSecurityCode(context.userId, "step_up", data.code))) {
        throw new Error("De code klopt niet of is verlopen.");
      }
    } else if (data.method === "sms") {
      const { consumeSecurityCode } = await import("@/lib/security-code.server");
      if (!data.code || !(await consumeSecurityCode(context.userId, "step_up_sms", data.code))) {
        throw new Error("De code klopt niet of is verlopen.");
      }
    } else if (data.method === "totp") {
      if (!data.code) throw new Error("Vul de 6-cijferige code in.");
      const { createRoutAuth } = await import("@/lib/better-auth.server");
      try {
        // The twoFactor plugin adds verifyTOTP; the factory's return type does not carry plugin endpoints.
        const api = createRoutAuth(request).api as unknown as {
          verifyTOTP: (o: { headers: Headers; body: { code: string } }) => Promise<unknown>;
        };
        await api.verifyTOTP({ headers: request.headers, body: { code: data.code } });
      } catch {
        throw new Error("De code klopt niet.");
      }
    } else if (data.method === "backup") {
      if (!data.backupCode) throw new Error("Vul een herstelcode in.");
      const { createRoutAuth, resolveAuthSecret } = await import("@/lib/better-auth.server");
      const { hashBackupCode } = await import("@/lib/auth/backup-code-hash");
      try {
        // Codes are stored hashed; Better Auth compares hashes and removes the used one.
        const api = createRoutAuth(request).api as unknown as {
          verifyBackupCode: (o: { headers: Headers; body: { code: string; disableSession: boolean } }) => Promise<unknown>;
        };
        const hashed = await hashBackupCode(data.backupCode, resolveAuthSecret()?.secret ?? "");
        await api.verifyBackupCode({ headers: request.headers, body: { code: hashed, disableSession: true } });
      } catch {
        throw new Error("Deze herstelcode klopt niet of is al gebruikt.");
      }
    } else if (data.method === "password") {
      if (!data.password) throw new Error("Vul je wachtwoord in.");
      const { createRoutAuth } = await import("@/lib/better-auth.server");
      try {
        const api = createRoutAuth(request).api as unknown as {
          verifyPassword: (o: { headers: Headers; body: { password: string } }) => Promise<unknown>;
        };
        await api.verifyPassword({ headers: request.headers, body: { password: data.password } });
      } catch {
        throw new Error("Je wachtwoord klopt niet.");
      }
    } else {
      const { requirePasskeyStepUp } = await import("./step-up-guard.server");
      await requirePasskeyStepUp(context.userId, "primary_email_change");
      // Only the verified WebAuthn hook grants passkey proofs. Never renew an old proof here.
      return { ok: true as const };
    }
    const { grantStepUp } = await import("./step-up.server");
    await grantStepUp(context.userId, data.method, undefined, action);
    return { ok: true as const };
  });

/**
 * Better Auth refuses passkey registration when the session is older than its fresh age.
 * After a successful step-up (signed cookie, ≤120 s) we mark the current session as freshly
 * re-authenticated, which is exactly what a re-login would do, without signing the user out.
 */
export const refreshSessionFreshness = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { ensureStepUpSession } = await import("./step-up.server");
    await ensureStepUpSession(context.userId, "passkey_add");
    const { getCookie } = await import("@tanstack/react-start/server");
    const raw = getCookie("__Secure-better-auth.session_token") ?? getCookie("better-auth.session_token");
    const token = raw ? decodeURIComponent(raw).split(".")[0] : "";
    if (!token) throw new Error("Geen actieve sessie gevonden.");
    const { sql } = await import("@/lib/neon");
    await sql`update neon_auth.session set "createdAt" = now() where token = ${token} and "expiresAt" > now()`;
    return { ok: true as const };
  });

