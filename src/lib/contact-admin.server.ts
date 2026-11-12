import { safeOrTerm } from "@/lib/db/search-term";
/**
 * Server-only reader for the admin contact-form overview. Every export assumes
 * the caller was already proven to hold the `admin` role (checked in
 * `contact-admin.functions.ts`).
 */

export const CONTACT_STATUSES = ["pending", "sent", "sent_partial", "failed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface ContactSubmissionRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: string;
  status: string;
  error_detail: string | null;
  created_at: string;
}

export interface ContactQuery {
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  limit: number;
}

export async function fetchContactSubmissions(q: ContactQuery): Promise<ContactSubmissionRow[]> {
  const { dbAdmin } = await import("@/lib/db/admin.server");

  let query = dbAdmin
    .from("contact_submissions")
    .select("id, name, email, subject, message, locale, status, error_detail, created_at")
    .order("created_at", { ascending: false })
    .limit(q.limit);

  if (q.status && q.status !== "all") query = query.eq("status", q.status);
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.search) {
    const clean = safeOrTerm(q.search);
    const term = `%${clean}%`;
    if (clean) query = query.or(`name.ilike.${term},email.ilike.${term},subject.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[contact-admin] list failed:", error.message);
    throw new Error(error.message);
  }
  console.info(
    `[contact-admin] listed ${data?.length ?? 0} submissions status=${q.status ?? "all"}`,
  );
  return (data ?? []) as ContactSubmissionRow[];
}
