/**
 * Contactformulier-inzendingen: opslaan in Neon en de profieleigenaar
 * verwittigen via Brevo. Server-only.
 */
import { sql } from "@/lib/neon";
import { sendMail } from "@/emails/send.server";
import { parseContactFormConfig } from "@/lib/contact-form";
import { sendLeadWelcome } from "@/lib/brevo/client";

type Row = Record<string, unknown>;

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface LeadInput {
  handle: string;
  name: string | null;
  email: string;
  message: string | null;
}

/** Zoekt de eigenaar én het actieve contactformulier-blok van dit profiel. */
async function ownerFor(handle: string) {
  const rows = (await sql`
    select p.id, p.username, p.display_name, p.blocks,
           coalesce(p.forwarding_email, p.email) as email
      from public.profiles p
     where lower(p.username) = ${handle.toLowerCase()}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  const blocks = Array.isArray(row["blocks"]) ? (row["blocks"] as Row[]) : [];
  const block = blocks.find((b) => b?.["kind"] === "contact_form" && b?.["hidden"] !== true);
  if (!block) return null;
  return {
    username: (row["username"] as string | null) ?? handle,
    displayName: (row["display_name"] as string | null) ?? null,
    email: (row["email"] as string | null) ?? null,
    config: parseContactFormConfig(String(block["value"] ?? "")),
  };
}

export async function captureLead(input: LeadInput): Promise<{ ok: boolean; message: string }> {
  const owner = await ownerFor(input.handle);
  if (!owner) return { ok: false, message: "Dit profiel heeft geen actief contactformulier." };

  try {
    await sql`
      insert into public.lead_captures (handle, name, email, message)
      values (${input.handle.toLowerCase()}, ${input.name}, ${input.email}, ${input.message})
    `;
  } catch (error) {
    console.error("[lead-capture] opslaan mislukt", error);
    return { ok: false, message: "Versturen lukte niet. Probeer het later opnieuw." };
  }

  if (owner.email) {
    await sendMail({
      to: owner.email,
      subject: `Nieuw bericht via je ROUT-profiel`,
      replyTo: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      html: `
        <p>Je kreeg een nieuw bericht via je ROUT-profiel.</p>
        <ul>
          ${input.name ? `<li><strong>Naam:</strong> ${escapeHtml(input.name)}</li>` : ""}
          <li><strong>E-mail:</strong> ${escapeHtml(input.email)}</li>
          ${input.message ? `<li><strong>Bericht:</strong> ${escapeHtml(input.message)}</li>` : ""}
        </ul>
      `,
      text: `Nieuw bericht via ROUT.\nNaam: ${input.name ?? "-"}\nE-mail: ${input.email}\n${input.message ?? ""}`,
    });
  }

  // Welkomstmail naar de inschrijver zelf — max. één per adres per dag.
  const { hitRateLimit } = await import("./rate-limit-db.server");
  const welcomeLimit = await hitRateLimit("lead-welcome-to", input.email.toLowerCase(), { limit: 1, windowSec: 86_400 });
  if (welcomeLimit.ok) await sendLeadWelcome({
    to: input.email,
    name: input.name,
    ownerName: owner.displayName ?? owner.username,
    profileUrl: `${(process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "")}/${owner.username}`,
  }).catch(() => undefined);

  return { ok: true, message: owner.config.successMessage };
}
