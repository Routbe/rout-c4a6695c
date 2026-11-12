import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server";

/**
 * Dev-only test email sender. Sends a real ROUT auth mail through Brevo so the
 * templates can be reviewed in an actual mail client.
 *
 * Restricted to admins and rate-limited: an unlocked dev route must not become
 * a mail-bomb vector or a way to enumerate accounts.
 */

const ALL_TEMPLATES = [
  "confirmation",
  "magic-link",
  "recovery",
  "invite",
  "email-change",
  "reauthentication",
] as const;

export type TestTemplate = (typeof ALL_TEMPLATES)[number];

/** Realistic sample data for every template, used both for previews and as a reference here. */
export const SAMPLE_DATA: Record<TestTemplate, Record<string, string>> = {
  confirmation: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_a1b2c3d4e5f6&type=signup",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  "magic-link": {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_9f8e7d6c5b4a&type=magiclink",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  recovery: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_4c3b2a1f0e9d&type=recovery",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
  invite: {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_7a6b5c4d3e2f&type=invite",
    SiteURL: "https://rout.be",
    Email: "nieuwe.gebruiker@voorbeeld.be",
  },
  "email-change": {
    Token: "482913",
    ConfirmationURL: "https://rout.be/auth/confirm?token=pkce_2e1d0c9b8a7f&type=email_change",
    SiteURL: "https://rout.be",
    Email: "oud@voorbeeld.be",
    NewEmail: "jasper.devries@voorbeeld.be",
  },
  reauthentication: {
    Token: "482913",
    SiteURL: "https://rout.be",
    Email: "jasper.devries@voorbeeld.be",
  },
};

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) =>
    z
      .object({
        template: z.enum(ALL_TEMPLATES),
        email: z.string().email(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);

    // Test mails only go to the signed-in admin's own address.
    const { sql } = await import("@/lib/neon");
    const own = (await sql`select email from public.users where id = ${context.userId} limit 1`) as { email: string | null }[];
    const ownEmail = own[0]?.email?.trim().toLowerCase();
    if (!ownEmail || ownEmail !== data.email.trim().toLowerCase()) {
      return { success: false as const, error: "Testmails gaan alleen naar je eigen e-mailadres." };
    }

    // In-memory sliding window, per admin: 5 test mails per 10 minutes. Good
    // enough to stop an accidental loop from the preview page — not a
    // security boundary, see rate-limit.server.ts.
    try {
      enforceRateLimit(`send-test-email:${context.userId}`, 5, 10 * 60 * 1000);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          success: false as const,
          error: error.message,
          rateLimited: true as const,
          retryAfterSeconds: error.retryAfterSeconds,
        };
      }
      throw error;
    }

    // One real send through Brevo, using our own auth-mail renderer — the same
    // path a production magic link takes, so a green result proves key, sender
    // domain and rendering all work.
    const { authEmailAction, authEmailCopy, renderAuthEmail } =
      await import("./auth-email-templates");
    const { sendMail } = await import("@/emails/send.server");

    const sample = SAMPLE_DATA[data.template];
    const action = authEmailAction(
      data.template === "magic-link"
        ? "magiclink"
        : data.template === "confirmation"
          ? "signup"
          : data.template.replace("-", "_"),
    );
    const copy = authEmailCopy(action, "nl");
    const result = await sendMail({
      to: data.email,
      subject: `[TEST] ${copy.subject}`,
      html: renderAuthEmail(copy, sample["ConfirmationURL"] ?? "https://rout.be", sample["Token"]),
      tags: ["auth-mail-test"],
    });

    if (!result.sent) {
      return { success: false as const, error: result.error ?? "Versturen mislukt." };
    }

    return {
      success: true as const,
      template: data.template,
      recipient: data.email,
    };
  });
