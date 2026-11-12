/**
 * Mails for the creator (influencer) and business verification flow.
 * Pure renderers — sending lives in `src/lib/verification-mail.server.ts`.
 *
 *  applicant: received → approved | rejected
 *  admin:     review request with Approve / Reject buttons
 */
import {
  actions,
  button,
  details,
  heading,
  layout,
  linkFallback,
  note,
  paragraph,
  pill,
  quote,
} from "./kit";

export type MailLang = "nl" | "en";
export type VerifyKind = "influencer" | "business";
export type Rendered = { subject: string; html: string };

export const mailLang = (v: unknown): MailLang =>
  typeof v === "string" && v.slice(0, 2).toLowerCase() === "nl" ? "nl" : v ? "en" : "nl";

const KIND_LABEL: Record<VerifyKind, Record<MailLang, string>> = {
  influencer: { nl: "Creator-badge", en: "Creator badge" },
  business: { nl: "Bedrijfsmerk", en: "Business mark" },
};
const tone = (k: VerifyKind): "creator" | "business" => (k === "influencer" ? "creator" : "business");

export function receivedMail(o: { lang: MailLang; kind: VerifyKind; name: string; dashboardUrl: string }): Rendered {
  const nl = o.lang === "nl";
  const label = KIND_LABEL[o.kind][o.lang];
  const subject = nl ? `We hebben je aanvraag ontvangen — ${label}` : `We received your request — ${label}`;
  return {
    subject,
    html: layout({
      lang: o.lang,
      preview: nl ? "Je aanvraag staat in de wachtrij." : "Your request is in the queue.",
      blocks: [
        pill(nl ? "In behandeling" : "In review", "warning"),
        heading(nl ? "Aanvraag ontvangen" : "Request received"),
        paragraph(
          nl
            ? `Bedankt${o.name ? `, ${o.name}` : ""}. We bekijken je aanvraag voor het ${label.toLowerCase()} met de hand, meestal binnen 2 werkdagen.`
            : `Thanks${o.name ? `, ${o.name}` : ""}. A person reviews your ${label.toLowerCase()} request, usually within 2 working days.`,
        ),
        paragraph(nl ? "Je krijgt een mail zodra er een beslissing is." : "You'll get an e-mail as soon as there's a decision."),
        actions(button(nl ? "Bekijk je aanvraag" : "View your request", o.dashboardUrl)),
      ],
    }),
  };
}

export function adminReviewMail(o: {
  kind: VerifyKind;
  applicant: { name: string; handle: string | null; email: string | null };
  fields: Array<[string, unknown]>;
  motivation?: string | null;
  approveUrl: string;
  rejectUrl: string;
  adminUrl: string;
  warning?: string | null;
}): Rendered {
  const label = KIND_LABEL[o.kind].nl;
  const who = o.applicant.handle ? `@${o.applicant.handle}` : o.applicant.name;
  return {
    subject: `Nieuwe aanvraag: ${label} — ${who}`,
    html: layout({
      lang: "nl",
      preview: `${who} vraagt het ${label.toLowerCase()} aan.`,
      blocks: [
        pill(label, tone(o.kind)),
        heading(`${who} vraagt het ${label.toLowerCase()} aan`),
        details([
          ["Naam", o.applicant.name],
          ["Handle", o.applicant.handle ? `@${o.applicant.handle}` : null],
          ["E-mail", o.applicant.email],
          ...o.fields,
        ]),
        ...(o.motivation ? [quote(o.motivation)] : []),
        ...(o.warning ? [paragraph(`⚠ ${o.warning}`)] : []),
        actions(
          button("Goedkeuren", o.approveUrl, "approve"),
          button("Afwijzen", o.rejectUrl, "reject"),
          button("Open in beheer", o.adminUrl, "ghost"),
        ),
        note("Elke knop opent eerst een bevestigingspagina. De links werken 14 dagen en één keer: zodra de aanvraag behandeld is, doen ze niets meer."),
      ],
    }),
  };
}

export function approvedMail(o: {
  lang: MailLang;
  kind: VerifyKind;
  name: string;
  handle: string | null;
  profileUrl: string | null;
  dashboardUrl: string;
}): Rendered {
  const nl = o.lang === "nl";
  const label = KIND_LABEL[o.kind][o.lang];
  const badgeLine =
    o.kind === "influencer"
      ? nl ? "De roze creator-badge staat nu naast je naam." : "The pink creator badge now sits next to your name."
      : nl ? "Je profiel draagt nu het zwarte bedrijfsmerk." : "Your profile now carries the black business mark.";
  const url = o.profileUrl ?? o.dashboardUrl;
  return {
    subject: nl ? `Goedgekeurd: je ${label.toLowerCase()} is actief` : `Approved: your ${label.toLowerCase()} is live`,
    html: layout({
      lang: o.lang,
      preview: badgeLine,
      blocks: [
        pill(nl ? "Goedgekeurd" : "Approved", "success"),
        heading(nl ? `Proficiat${o.name ? `, ${o.name}` : ""}!` : `Congratulations${o.name ? `, ${o.name}` : ""}!`),
        paragraph(badgeLine),
        details([[nl ? "Jouw adres" : "Your address", o.handle ? `rout.be/${o.handle}` : null]]),
        actions(button(nl ? "Bekijk je profiel" : "View your profile", url)),
        linkFallback(nl ? "Werkt de knop niet? Open:" : "Button not working? Open:", url),
      ],
    }),
  };
}

export function rejectedMail(o: { lang: MailLang; kind: VerifyKind; name: string; reason: string | null; dashboardUrl: string }): Rendered {
  const nl = o.lang === "nl";
  const label = KIND_LABEL[o.kind][o.lang];
  return {
    subject: nl ? `Update over je aanvraag — ${label}` : `Update on your request — ${label}`,
    html: layout({
      lang: o.lang,
      preview: nl ? "We konden je aanvraag nu niet goedkeuren." : "We couldn't approve your request this time.",
      blocks: [
        pill(nl ? "Niet goedgekeurd" : "Not approved", "danger"),
        heading(nl ? "We konden je aanvraag niet goedkeuren" : "We couldn't approve your request"),
        paragraph(
          nl
            ? `Hallo${o.name ? ` ${o.name}` : ""}, we hebben je aanvraag voor het ${label.toLowerCase()} bekeken en kunnen ze op dit moment niet goedkeuren.`
            : `Hi${o.name ? ` ${o.name}` : ""}, we reviewed your ${label.toLowerCase()} request and can't approve it right now.`,
        ),
        ...(o.reason ? [paragraph(nl ? "Reden:" : "Reason:"), quote(o.reason)] : []),
        paragraph(nl ? "Je mag later opnieuw aanvragen. Vragen? Antwoord gewoon op deze mail." : "You're welcome to apply again later. Questions? Just reply to this e-mail."),
        actions(button(nl ? "Naar je dashboard" : "Go to your dashboard", o.dashboardUrl, "ghost")),
      ],
    }),
  };
}
