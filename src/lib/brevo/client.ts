/**
 * Nette dispatch-wrappers boven de centrale mailer. Elke wrapper kiest zelf het
 * juiste Brevo-template via `resolveBrevoTemplate()` en levert altijd een
 * inline HTML-body mee, zodat een nog niet gebouwd taalblok (ID 0) toch een
 * verzorgde mail oplevert. Server-only.
 */
import { sendMail } from "@/emails/send.server";
import { resolveBrevoTemplate, type BrevoCategory } from "./templates";

type Attachment = { name: string; contentBase64: string };

interface DispatchInput {
  to: string;
  language?: string | null;
  subject: string;
  html: string;
  text?: string;
  params?: Record<string, unknown>;
  replyTo?: { email: string; name?: string };
  attachments?: Attachment[];
  tags?: string[];
}

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Verstuurt één mail voor een categorie uit het Brevo-rooster. */
export async function dispatchBrevo(
  category: BrevoCategory,
  input: DispatchInput,
): Promise<{ sent: boolean; error?: string }> {
  const templateId = resolveBrevoTemplate(category, input.language);
  return sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(templateId ? { templateId } : {}),
    language: input.language ?? "nl",
    params: {
      LANGUAGE: (input.language ?? "nl").slice(0, 2),
      ...(input.params ?? {}),
    },
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    tags: input.tags ?? [`rout-${category.toLowerCase()}`],
  });
}

const shell = (body: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6">${body}</div>`;

/** Blauw vinkje goedgekeurd. */
export function sendVerificationApproved(opts: {
  to: string;
  language?: string | null;
  legalName: string;
  handle: string;
  profileUrl: string;
}) {
  return dispatchBrevo("VERIFICATION_APPROVED", {
    to: opts.to,
    language: opts.language,
    subject: "Geverifieerd! Je blauwe vinkje staat live",
    params: { LEGAL_NAME: opts.legalName, HANDLE: opts.handle, PROFILE_URL: opts.profileUrl },
    html: shell(
      `<p>Dag ${escapeHtml(opts.legalName)},</p>
       <p>Je identiteit is goedgekeurd. Je profiel draagt nu het blauwe vinkje en staat live op
       <a href="${opts.profileUrl}">${escapeHtml(opts.profileUrl)}</a>.</p>
       <p>Je handle is <strong>${escapeHtml(opts.handle)}</strong>.</p>`,
    ),
  });
}

/** Verificatie afgewezen. */
export function sendVerificationRejected(opts: {
  to: string;
  language?: string | null;
  name?: string | null;
  reason?: string | null;
}) {
  return dispatchBrevo("VERIFICATION_REJECTED", {
    to: opts.to,
    language: opts.language,
    subject: "Je verificatieaanvraag bij ROUT",
    params: { NAME: opts.name ?? "", REASON: opts.reason ?? "" },
    html: shell(
      `<p>Dag ${escapeHtml(opts.name ?? "")},</p>
       <p>We konden je verificatie niet goedkeuren.${
         opts.reason ? ` Reden: ${escapeHtml(opts.reason)}.` : ""
       }</p>
       <p>Je kan opnieuw indienen met een geldig identiteitsbewijs.</p>`,
    ),
  });
}

/** Privacy-alias gekoppeld aan een geverifieerd account. */
export function sendAliasLinked(opts: {
  to: string;
  language?: string | null;
  alias: string;
  aliasUrl: string;
}) {
  return dispatchBrevo("ALIAS_LINKED", {
    to: opts.to,
    language: opts.language,
    subject: "Je privacy-alias is gekoppeld",
    params: { ALIAS: opts.alias, ALIAS_URL: opts.aliasUrl },
    html: shell(
      `<p>Je privacy-alias <strong>${escapeHtml(opts.alias)}</strong> is gekoppeld aan je
       geverifieerde ROUT-account en staat live op
       <a href="${opts.aliasUrl}">${escapeHtml(opts.aliasUrl)}</a>.</p>
       <p>Je wettelijke naam blijft privé op dit aliasprofiel.</p>`,
    ),
  });
}

/** Nieuwe boeking → melding naar de host met accept/decline-links. */
export function sendBookingRequestToHost(opts: {
  to: string;
  language?: string | null;
  guestName: string;
  guestEmail: string;
  date: string;
  time: string;
  durationMinutes: number;
  message?: string | null;
  acceptUrl: string;
  declineUrl: string;
}) {
  return dispatchBrevo("BOOKING_HOST_REQUEST", {
    to: opts.to,
    language: opts.language,
    subject: `Nieuwe afspraakaanvraag van ${opts.guestName}`,
    replyTo: { email: opts.guestEmail, name: opts.guestName },
    params: {
      GUEST_NAME: opts.guestName,
      GUEST_EMAIL: opts.guestEmail,
      DATE: opts.date,
      TIME: opts.time,
      DURATION: opts.durationMinutes,
      ACCEPT_URL: opts.acceptUrl,
      DECLINE_URL: opts.declineUrl,
    },
    html: shell(
      `<p>Je kreeg een nieuwe afspraakaanvraag via je ROUT-profiel.</p>
       <ul>
         <li><strong>Naam:</strong> ${escapeHtml(opts.guestName)}</li>
         <li><strong>E-mail:</strong> ${escapeHtml(opts.guestEmail)}</li>
         <li><strong>Datum:</strong> ${escapeHtml(opts.date)} om ${escapeHtml(opts.time)}</li>
         <li><strong>Duur:</strong> ${opts.durationMinutes} min</li>
       </ul>
       ${opts.message ? `<p><strong>Bericht:</strong><br>${escapeHtml(opts.message)}</p>` : ""}
       <p><a href="${opts.acceptUrl}">✅ Aanvaarden</a> &nbsp;·&nbsp;
          <a href="${opts.declineUrl}">❌ Weigeren</a></p>`,
    ),
    text:
      `Nieuwe afspraakaanvraag van ${opts.guestName} (${opts.guestEmail}) op ` +
      `${opts.date} ${opts.time}.\nAanvaarden: ${opts.acceptUrl}\nWeigeren: ${opts.declineUrl}`,
  });
}

/** Boeking aanvaard → bevestiging naar de gast met .ics-bijlage. */
export function sendBookingConfirmedToGuest(opts: {
  to: string;
  language?: string | null;
  guestName: string;
  hostName: string;
  hostEmail: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  calendarUrl: string;
  ics: string;
}) {
  return dispatchBrevo("BOOKING_GUEST_CONFIRMED", {
    to: opts.to,
    language: opts.language,
    subject: `Bevestigd: ${opts.title} op ${opts.date} om ${opts.time}`,
    replyTo: { email: opts.hostEmail, name: opts.hostName },
    params: {
      GUEST_NAME: opts.guestName,
      HOST_NAME: opts.hostName,
      TITLE: opts.title,
      DATE: opts.date,
      TIME: opts.time,
      DURATION: opts.durationMinutes,
      CALENDAR_URL: opts.calendarUrl,
    },
    html: shell(
      `<p>Dag ${escapeHtml(opts.guestName)},</p>
       <p>${escapeHtml(opts.hostName)} bevestigde je afspraak op
       <strong>${escapeHtml(opts.date)} om ${escapeHtml(opts.time)}</strong>
       (${opts.durationMinutes} min).</p>
       <p><a href="${opts.calendarUrl}">Toevoegen aan Google Calendar</a> — of open de bijgevoegde
       <code>afspraak.ics</code> voor Apple Calendar en Outlook.</p>`,
    ),
    text: `Bevestigd: ${opts.title} op ${opts.date} om ${opts.time} (${opts.durationMinutes} min). Google Calendar: ${opts.calendarUrl}`,
    attachments: [
      { name: "afspraak.ics", contentBase64: Buffer.from(opts.ics, "utf8").toString("base64") },
    ],
  });
}

/** Boeking geweigerd → melding naar de gast. */
export function sendBookingDeclinedToGuest(opts: {
  to: string;
  language?: string | null;
  guestName: string;
  hostName: string;
  date: string;
  time: string;
}) {
  return dispatchBrevo("BOOKING_GUEST_DECLINED", {
    to: opts.to,
    language: opts.language,
    subject: `Je afspraakaanvraag bij ${opts.hostName}`,
    params: {
      GUEST_NAME: opts.guestName,
      HOST_NAME: opts.hostName,
      DATE: opts.date,
      TIME: opts.time,
    },
    html: shell(
      `<p>Dag ${escapeHtml(opts.guestName)},</p>
       <p>${escapeHtml(opts.hostName)} kan helaas niet op ${escapeHtml(opts.date)} om
       ${escapeHtml(opts.time)}. Je mag gerust een ander moment voorstellen.</p>`,
    ),
    text: `Dag ${opts.guestName}, ${opts.hostName} kan helaas niet op ${opts.date} om ${opts.time}.`,
  });
}

/** Welkomstmail na inschrijving via het profielformulier. */
export function sendLeadWelcome(opts: {
  to: string;
  language?: string | null;
  name?: string | null;
  ownerName: string;
  profileUrl: string;
}) {
  return dispatchBrevo("LEAD_WELCOME", {
    to: opts.to,
    language: opts.language,
    subject: `Bedankt voor je bericht aan ${opts.ownerName}`,
    params: { NAME: opts.name ?? "", OWNER_NAME: opts.ownerName, PROFILE_URL: opts.profileUrl },
    html: shell(
      `<p>Dag ${escapeHtml(opts.name ?? "")},</p>
       <p>Bedankt voor je bericht via het profiel van ${escapeHtml(opts.ownerName)} op ROUT.
       Je krijgt snel persoonlijk antwoord.</p>
       <p><a href="${opts.profileUrl}">${escapeHtml(opts.profileUrl)}</a></p>`,
    ),
  });
}

/** Ontvangstbewijs na een tip/donatie. */
export function sendDonationReceipt(opts: {
  to: string;
  language?: string | null;
  supporterName?: string | null;
  creatorHandle: string;
  amountCents: number;
  message?: string | null;
}) {
  const amount = (opts.amountCents / 100).toFixed(2);
  return dispatchBrevo("DONATION_RECEIPT", {
    to: opts.to,
    language: opts.language,
    subject: `Bedankt voor je steun aan @${opts.creatorHandle}`,
    params: {
      SUPPORTER_NAME: opts.supporterName ?? "",
      HANDLE: opts.creatorHandle,
      AMOUNT: `€ ${amount}`,
      MESSAGE: opts.message ?? "",
    },
    html: shell(
      `<p>Dag ${escapeHtml(opts.supporterName ?? "")},</p>
       <p>We ontvingen je steun van <strong>€ ${amount}</strong> voor
       <strong>@${escapeHtml(opts.creatorHandle)}</strong>. Dit is je ontvangstbewijs.</p>
       ${opts.message ? `<p><em>“${escapeHtml(opts.message)}”</em></p>` : ""}`,
    ),
  });
}
