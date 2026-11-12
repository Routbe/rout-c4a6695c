import { redirectDestination } from "./redirect-target";
import { sql } from "@/lib/neon";

export async function safeExternalRedirect(raw: string, trustedOwner = false): Promise<string | null> {
  let ownDomains: string[] = [];
  try {
    const host = new URL(raw, "https://rout.be").hostname;
    const rows = await sql.query("select domain from public.custom_domains where domain=$1 and verified_at is not null and status='verified' limit 1", [host]) as { domain: string }[];
    ownDomains = rows.map(r => r.domain);
  } catch { /* unknown domains require confirmation */ }
  return redirectDestination(raw, trustedOwner, ownDomains);
}