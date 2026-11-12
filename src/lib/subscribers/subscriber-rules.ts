/**
 * Pure rules for the signup block (browser- and test-safe).
 * Addresses are only ever handled in plain form inside one server request.
 */

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export function normalizeSubscriberEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 200) return null;
  if (!/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email)) return null;
  return email;
}

/** Spreadsheet formula injection guard: a leading = + - @ tab or CR becomes literal text. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface SubscriberCsvRow {
  email: string;
  handle: string;
  space: "root" | "alias";
  status: SubscriberStatus;
  createdAt: string;
  confirmedAt: string | null;
}

/** Owner CSV: unsubscribed people are never listed, they only remain as a count. */
export function buildSubscribersCsv(rows: SubscriberCsvRow[], opts: { confirmedOnly?: boolean } = {}): string {
  const header = ["email", "profile", "status", "signed_up_at", "confirmed_at"];
  const lines = rows
    .filter((r) => r.status !== "unsubscribed" && r.email)
    .filter((r) => !opts.confirmedOnly || r.status === "confirmed")
    .map((r) =>
      [r.email, r.space === "alias" ? `u/${r.handle}` : r.handle, r.status, r.createdAt, r.confirmedAt ?? ""].map(csvCell).join(","),
    );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** Only these subscription tokens are accepted: 43 url-safe characters (32 random bytes). */
export const isSubscriberToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
