/**
 * Minor protection rules (db/0174). Pure and browser-safe: age from a birth
 * date, who may send a question at each Q&A level, and the sign-up headers.
 */
/** Under this age a parent must consent (owner decision, db/0174). */
export const MINOR_AGE = 16;
/** Under this age Q&A defaults to private (verified accounts only), per EU minors guidance (db/0183). */
export const PROTECTED_AGE = 18;
export const SIGNUP_DOB_HEADER = "x-rout-dob";
export const SIGNUP_PARENT_EMAIL_HEADER = "x-rout-parent-email";
export const PARENT_PAYMENT_HOURS = 48;

export const QA_LEVELS = ["disabled", "verified_only", "members_only", "public_unrestricted"] as const;
export type QaLevel = (typeof QA_LEVELS)[number];

export const QA_LEVEL_LABELS: Record<QaLevel, { n: number; title: string; body: string }> = {
  disabled: { n: 1, title: "Uit", body: "Niemand kan berichten sturen." },
  verified_only: { n: 2, title: "Alleen geverifieerde accounts", body: "Alleen ingelogde, geverifieerde ROUT-accounts." },
  members_only: { n: 3, title: "Alle ROUT-leden", body: "Iedereen die ingelogd is op ROUT." },
  public_unrestricted: { n: 4, title: "Iedereen", body: "Ook bezoekers zonder account (anoniem)." },
};

export const MINOR_QA_NOTICE = "Deze gebruiker stelt een geverifieerd ROUT-account verplicht om berichten te sturen.";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD into a real calendar date, or null. */
export function parseDob(raw: string | null | undefined, today = new Date()): { y: number; m: number; d: number } | null {
  const m = ISO_DATE.exec((raw ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900 || dt.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) return null;
  return { y, m: mo, d };
}

export function ageOn(raw: string, today = new Date()): number | null {
  const dob = parseDob(raw, today);
  if (!dob) return null;
  const ty = today.getUTCFullYear(), tm = today.getUTCMonth() + 1, td = today.getUTCDate();
  let age = ty - dob.y;
  if (tm < dob.m || (tm === dob.m && td < dob.d)) age -= 1;
  return age;
}

/** True when the person is younger than 16 on `today`. */
export function isMinorDob(raw: string, today = new Date()): boolean {
  const age = ageOn(raw, today);
  return age !== null && age < MINOR_AGE;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the person is younger than 18: private defaults apply. */
export function isProtectedDob(raw: string, today = new Date()): boolean {
  const age = ageOn(raw, today);
  return age !== null && age < PROTECTED_AGE;
}

/** Validates the sign-up age fields; a minor must give a parent address that is not their own. */
export function signupAgeProblem(input: { dob: string; parentEmail: string; email: string }, today = new Date()):
  | null | "dob_invalid" | "parent_email_required" | "parent_email_same" {
  if (ageOn(input.dob, today) === null) return "dob_invalid";
  if (!isMinorDob(input.dob, today)) return null;
  const p = input.parentEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(p) || p.length > 254) return "parent_email_required";
  if (p === input.email.trim().toLowerCase()) return "parent_email_same";
  return null;
}

/** Who may send a question at a level. `verified` = signed in with a verified ROUT account. */
export function canSendQuestion(level: QaLevel, viewer: { signedIn: boolean; verified: boolean }): boolean {
  switch (level) {
    case "disabled": return false;
    case "verified_only": return viewer.signedIn && viewer.verified;
    case "members_only": return viewer.signedIn;
    case "public_unrestricted": return true;
  }
}

export function isQaLevel(v: unknown): v is QaLevel {
  return typeof v === "string" && (QA_LEVELS as readonly string[]).includes(v);
}

/** Canvas settings can tighten, never weaken, parental/account safety. */
export function stricterQaLevel(account: QaLevel, canvas: QaLevel): QaLevel {
  return QA_LEVELS[Math.min(QA_LEVELS.indexOf(account), QA_LEVELS.indexOf(canvas))] ?? "disabled";
}
