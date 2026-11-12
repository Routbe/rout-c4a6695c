import { sql } from "@/lib/neon";
import { maskEmail, maskEmailsInText } from "@/lib/security/redact";

import {
  asNotificationLocale,
  authEmailCopy,
  renderAuthEmail,
  type AuthEmailAction,
} from "@/lib/auth-email-templates";
import type { EmailCategory } from "@/emails/template-ids";

import { toSessionUser, type SessionUser } from "./session.server";

/**
 * Identity management on Neon: sign-up, sign-in, magic links, password reset
 * and e-mail confirmation. Everything here runs server-side against Frankfurt.
 */

type Row = Record<string, unknown>;

const USER_COLUMNS = `id, email, email_confirmed_at, user_metadata, app_metadata, created_at, last_sign_in_at`;

export class AuthError extends Error {
  constructor(
    public code:
      | "invalid_credentials"
      | "email_taken"
      | "weak_password"
      | "invalid_email"
      | "invalid_token"
      | "user_disabled"
      | "not_found",
    message?: string,
  ) {
    super(message ?? code);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) throw new AuthError("invalid_email", "Enter a valid e-mail address.");
  return value;
}

function assertPassword(password: string) {
  if (password.length < 10) {
    throw new AuthError("weak_password", "Use at least 10 characters.");
  }
}

export async function findUserByEmail(email: string): Promise<Row | null> {
  const rows = (await sql`
    select ${sql.unsafe(USER_COLUMNS)}, is_disabled
      from public.users where email_normalized = ${email.trim().toLowerCase()} limit 1
  `) as Row[];
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<SessionUser | null> {
  const rows = (await sql`
    select ${sql.unsafe(USER_COLUMNS)} from public.users where id = ${id} and not is_disabled limit 1
  `) as Row[];
  return rows[0] ? toSessionUser(rows[0]) : null;
}

/** Creates the identity; the `on_user_created` trigger seeds the profile row. */
export async function createUser(input: {
  email: string;
  password?: string | null;
  metadata?: Record<string, unknown>;
  emailConfirmed?: boolean;
}): Promise<SessionUser> {
  const email = assertEmail(input.email);
  if (input.password != null) assertPassword(input.password);
  if (await findUserByEmail(email))
    throw new AuthError("email_taken", "This e-mail is already registered.");

  const rows = (await sql`
    insert into public.users (email, user_metadata, email_confirmed_at)
    values (${email}, ${JSON.stringify(input.metadata ?? {})},
            ${input.emailConfirmed ? new Date().toISOString() : null})
    returning ${sql.unsafe(USER_COLUMNS)}
  `) as Row[];
  const created = toSessionUser(rows[0]!);
  // Passkey-only platform: passwords are never stored.
  if (input.password) throw new AuthError("invalid_credentials", "ROUT accepteert alleen passkeys.");
  const { ensureOwnerAdmin } = await import("./owner-admin.server");
  await ensureOwnerAdmin(created.id, email);
  return created;
}

export async function updateUserMetadata(userId: string, patch: Record<string, unknown>) {
  const rows = (await sql`
    update public.users
       set user_metadata = user_metadata || ${JSON.stringify(patch)}::jsonb,
           updated_at = now()
     where id = ${userId}
    returning ${sql.unsafe(USER_COLUMNS)}
  `) as Row[];
  if (!rows[0]) throw new AuthError("not_found");
  return toSessionUser(rows[0]);
}

/** Passkey-only platform: passwords cannot be set. */
export async function changePassword(_userId: string, _newPassword: string): Promise<never> {
  throw new AuthError("invalid_credentials", "ROUT accepteert alleen passkeys.");
}

export async function changeEmail(userId: string, newEmail: string) {
  const { requestPrimaryEmailChange } = await import("./email-safety.server");
  return requestPrimaryEmailChange(userId, assertEmail(newEmail));
}

// ---------------------------------------------------------------------------
// One-time tokens: magic link, password reset, e-mail confirmation
// ---------------------------------------------------------------------------

export type TokenPurpose = "magic_link" | "password_reset" | "email_confirm" | "email_change";

/**
 * Retired: Better Auth issues every sign-in, reset and confirmation link. The
 * old auth_tokens table is closed to the app role (db/0226) and nothing could
 * redeem these links any more, so issuing one fails loudly instead.
 */
export async function issueToken(
  _userId: string,
  _purpose: TokenPurpose,
  _payload: Record<string, unknown> = {},
): Promise<string> {
  throw new AuthError("invalid_token", "Legacy one-time links are retired; sign-in links come from Better Auth.");
}

/** Retired together with issueToken. */
export async function consumeToken(_token: string, _purpose: TokenPurpose): Promise<never> {
  throw new AuthError("invalid_token", "This link is invalid or has expired.");
}

/**
 * Every auth mail leaves through the one central Brevo mailer, rendered with
 * ROUT's own four-language template. A missing BREVO_API_KEY is logged loudly
 * by `sendMail` and reported back here, never swallowed.
 */
async function mailAuthAction(
  email: string,
  action: AuthEmailAction,
  url: string,
  opts: { locale?: unknown; code?: string | null } = {},
): Promise<boolean> {
  const locale = asNotificationLocale(opts.locale);
  const copy = authEmailCopy(action, locale);
  const { sendMail } = await import("@/emails/send.server");
  const category: EmailCategory =
    action === "signup"
      ? "confirmation"
      : action === "invite"
        ? "invite"
        : action === "recovery"
          ? "recovery"
          : action === "email_change" || action === "email_change_new"
            ? "email_change"
            : action === "reauthentication"
              ? "reauthentication"
              : "login";
  const html = renderAuthEmail(copy, url, opts.code ?? null);
  const { asEmailLanguage, brevoTemplateId } = await import("@/emails/template-ids");
  // De taal van de gebruiker bepaalt de Brevo-template (auth-reeks: nl #93,
  // en #13, fr #14, de #15, es #16, it #17, pt #18, pl #19, zh #20, fallback #21).
  const language = asEmailLanguage(opts.locale ?? locale);
  const templateId = brevoTemplateId(category, language);
  console.info(
    `[Auth] Sending ${action} mail via Brevo template #${templateId} (lang=${language}) to ${maskEmail(email)}`,
  );
  const { sent, error } = await sendMail({
    to: email,
    subject: copy.subject,
    html,
    category,
    language,
    params: {
      TITLE: copy.title,
      BODY: copy.body,
      CTA: copy.cta,
      LINK: url,
      MAGIC_LINK: url,
      // Kleine-letter aliassen: de Brevo-templates vallen hierop terug
      // ({{ params.CODE | default: params.code | default: params.token }}).
      url: url,
      link: url,
      CODE: opts.code ?? "",
      code: opts.code ?? "",
      token: opts.code ?? "",
      CODE_LABEL: copy.codeLabel,
      FOOTER: copy.footer,
      LANG: language,
    },
    tags: [`auth-${action}`],
  });
  if (!sent) {
    console.error(
      `[auth-mail] ${action} could not be delivered: ${maskEmailsInText(error ?? "unknown Brevo error")}`,
    );
  }
  return sent;
}

/** Magic-link sign-in. Silently succeeds for unknown addresses (no enumeration). */
export async function requestMagicLink(rawEmail: string, origin: string) {
  const email = assertEmail(rawEmail);
  const row = await findUserByEmail(email);
  if (!row) return { sent: false, known: false };
  const token = await issueToken(row["id"] as string, "magic_link");
  const sent = await mailAuthAction(
    email,
    "magiclink",
    `${origin}/auth/verify?type=magic_link&token=${token}`,
    { locale: (row["user_metadata"] as Record<string, unknown> | null)?.["locale"] },
  );
  return { sent, known: true };
}

// ---------------------------------------------------------------------------
// E-mail sign-in with a 6-digit code (same mail as the magic link)
// ---------------------------------------------------------------------------

function sixDigitCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0]! % 900000));
}

/**
 * Issues a magic link *and* a 6-digit code in one mail: the link is the fast
 * path, the code works when the member opens the mail on another device.
 * Unknown addresses return the same shape without sending anything.
 */
export async function requestEmailCode(rawEmail: string, origin: string) {
  const email = assertEmail(rawEmail);
  const row = await findUserByEmail(email);
  if (!row) return { sent: false, known: false as const };

  const userId = row["id"] as string;
  const code = sixDigitCode();

  const linkToken = await issueToken(userId, "magic_link");
  const sent = await mailAuthAction(
    email,
    "login",
    `${origin}/auth/verify?type=magic_link&token=${linkToken}`,
    { locale: (row["user_metadata"] as Record<string, unknown> | null)?.["locale"], code },
  );
  return { sent, known: true as const };
}

/** Consumes a 6-digit code and opens a session for the owning member. */
export async function requestPasswordReset(rawEmail: string, origin: string) {
  const email = assertEmail(rawEmail);
  const row = await findUserByEmail(email);
  if (!row) return { sent: false, known: false };
  const token = await issueToken(row["id"] as string, "password_reset");
  const sent = await mailAuthAction(
    email,
    "recovery",
    `${origin}/auth/verify?type=password_reset&token=${token}`,
    { locale: (row["user_metadata"] as Record<string, unknown> | null)?.["locale"] },
  );
  return { sent, known: true };
}

export async function requestEmailConfirmation(userId: string, email: string, origin: string) {
  const token = await issueToken(userId, "email_confirm");
  return mailAuthAction(email, "signup", `${origin}/auth/verify?type=email_confirm&token=${token}`);
}

export async function confirmEmail(userId: string) {
  await sql`
    update public.users set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
     where id = ${userId}
  `;
}
