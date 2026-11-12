/**
 * Status mails for the rest of the site, same design kit as the verification mails.
 * Pure renderers — sending lives in `src/lib/site-mail.server.ts`.
 */
import { actions, button, details, heading, layout, note, paragraph, pill } from "./kit";
import type { MailLang, Rendered } from "./verification-mails";

const hi = (nl: boolean, name: string) => (name ? (nl ? `Hallo ${name},` : `Hi ${name},`) : nl ? "Hallo," : "Hi,");

export function signInNoticeMail(o: { lang: MailLang; name: string; device: string; when: string; securityUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: nl ? "Nieuwe aanmelding op je ROUT-account" : "New sign-in to your ROUT account",
    html: layout({
      lang: o.lang,
      preview: nl ? "Er is aangemeld vanaf een nieuw toestel." : "Someone signed in from a new device.",
      blocks: [
        pill(nl ? "Beveiliging" : "Security", "warning"),
        heading(nl ? "Nieuwe aanmelding" : "New sign-in"),
        paragraph(hi(nl, o.name)),
        paragraph(nl ? "Er is net aangemeld op je account vanaf een toestel dat we nog niet kenden." : "Your account was just signed in from a device we hadn't seen before."),
        details([[nl ? "Toestel" : "Device", o.device], [nl ? "Tijdstip" : "Time", o.when]]),
        paragraph(nl ? "Was jij dit? Dan hoef je niets te doen." : "Was this you? Then there's nothing to do."),
        actions(button(nl ? "Niet ik — beveilig mijn account" : "Not me — secure my account", o.securityUrl, "ghost")),
      ],
    }),
  };
}

export function appConnectedMail(o: { lang: MailLang; name: string; app: string; scopes: string[]; manageUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: nl ? `${o.app} heeft nu toegang via ROUT` : `${o.app} now has access via ROUT`,
    html: layout({
      lang: o.lang,
      preview: nl ? `Je meldde je aan bij ${o.app} met ROUT.` : `You signed in to ${o.app} with ROUT.`,
      blocks: [
        pill(nl ? "Gekoppelde app" : "Connected app"),
        heading(nl ? `Aangemeld bij ${o.app}` : `Signed in to ${o.app}`),
        paragraph(hi(nl, o.name)),
        paragraph(nl ? `Je gaf ${o.app} toegang tot je ROUT-account.` : `You gave ${o.app} access to your ROUT account.`),
        details([[nl ? "Gedeeld" : "Shared", o.scopes.join(", ")]]),
        actions(button(nl ? "Beheer gekoppelde apps" : "Manage connected apps", o.manageUrl)),
      ],
    }),
  };
}

export function secretRotatedMail(o: { lang: MailLang; name: string; app: string; consoleUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: nl ? `Nieuw clientgeheim voor ${o.app}` : `New client secret for ${o.app}`,
    html: layout({
      lang: o.lang,
      preview: nl ? "Het oude geheim werkt niet meer." : "The old secret no longer works.",
      blocks: [
        pill(nl ? "Ontwikkelaarsconsole" : "Developer console", "warning"),
        heading(nl ? "Clientgeheim vernieuwd" : "Client secret rotated"),
        paragraph(hi(nl, o.name)),
        paragraph(nl ? `Er is een nieuw clientgeheim gemaakt voor ${o.app}. Het oude werkt meteen niet meer.` : `A new client secret was created for ${o.app}. The old one stopped working immediately.`),
        note(nl ? "Deed jij dit niet? Vernieuw het geheim opnieuw en wijzig je wachtwoord." : "Wasn't you? Rotate the secret again and change your password."),
        actions(button(nl ? "Open de console" : "Open the console", o.consoleUrl)),
      ],
    }),
  };
}

export function appReviewMail(o: { lang: MailLang; name: string; app: string; approved: boolean; consoleUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: o.approved
      ? nl ? `${o.app} is geverifieerd` : `${o.app} is verified`
      : nl ? `${o.app} is niet geverifieerd` : `${o.app} was not verified`,
    html: layout({
      lang: o.lang,
      preview: o.approved ? (nl ? "Je app is nu voor iedereen open." : "Your app is now open to everyone.") : (nl ? "Bekijk wat er nog ontbreekt." : "See what's still missing."),
      blocks: [
        pill(o.approved ? (nl ? "Geverifieerd" : "Verified") : nl ? "Niet goedgekeurd" : "Not approved", o.approved ? "success" : "danger"),
        heading(o.approved ? (nl ? "Je app is geverifieerd" : "Your app is verified") : nl ? "Verificatie afgewezen" : "Verification declined"),
        paragraph(hi(nl, o.name)),
        paragraph(o.approved
          ? nl ? `${o.app} is niet langer in testfase: elk ROUT-lid kan er nu mee aanmelden.` : `${o.app} has left test mode: every ROUT member can now sign in with it.`
          : nl ? `We konden ${o.app} nog niet verifiëren. Controleer je privacy- en voorwaardenlinks en vraag opnieuw aan.` : `We couldn't verify ${o.app} yet. Check your privacy and terms links and apply again.`),
        actions(button(nl ? "Open de console" : "Open the console", o.consoleUrl)),
      ],
    }),
  };
}

export function appCreatedMail(o: { lang: MailLang; name: string; app: string; clientId: string; consoleUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: nl ? `Je app ${o.app} is aangemaakt` : `Your app ${o.app} was created`,
    html: layout({
      lang: o.lang,
      preview: nl ? "Je clientgeheim wordt eenmalig getoond." : "Your client secret is shown once.",
      blocks: [
        pill(nl ? "Ontwikkelaarsconsole" : "Developer console", "success"),
        heading(nl ? "App geregistreerd" : "App registered"),
        paragraph(hi(nl, o.name)),
        paragraph(nl
          ? `${o.app} is aangemaakt in de Developer Console. Het clientgeheim wordt alleen nu getoond — bewaar het veilig.`
          : `${o.app} was created in the Developer Console. The client secret is only shown once — store it safely.`),
        details([["Client ID", o.clientId]]),
        actions(button(nl ? "Open de console" : "Open the console", o.consoleUrl)),
      ],
    }),
  };
}

export function verificationRequestedMail(o: { lang: MailLang; app: string; clientId: string; note: string; reviewUrl: string }): Rendered {
  const nl = o.lang === "nl";
  return {
    subject: nl ? `Verificatieverzoek: ${o.app}` : `Verification request: ${o.app}`,
    html: layout({
      lang: o.lang,
      preview: nl ? "Er wacht een app op beoordeling." : "An app is waiting for review.",
      blocks: [
        pill(nl ? "Beheer" : "Admin", "warning"),
        heading(nl ? "Nieuw verificatieverzoek" : "New verification request"),
        paragraph(nl ? `De eigenaar van ${o.app} vraagt verificatie aan.` : `The owner of ${o.app} requested verification.`),
        details([["Client ID", o.clientId], [nl ? "Notitie" : "Note", o.note || "—"]]),
        actions(button(nl ? "Beoordeel het verzoek" : "Review the request", o.reviewUrl)),
      ],
    }),
  };
}

export function subdomainMail(o: { lang: MailLang; name: string; subdomain: string; stage: "requested" | "active"; url: string }): Rendered {
  const nl = o.lang === "nl";
  const live = o.stage === "active";
  return {
    subject: live
      ? nl ? `${o.subdomain} staat live` : `${o.subdomain} is live`
      : nl ? `Aanvraag ontvangen: ${o.subdomain}` : `Request received: ${o.subdomain}`,
    html: layout({
      lang: o.lang,
      preview: live ? (nl ? "Je eigen subdomein werkt." : "Your own subdomain works.") : (nl ? "We zetten de DNS klaar." : "We're setting up DNS."),
      blocks: [
        pill(live ? (nl ? "Live" : "Live") : nl ? "In behandeling" : "In progress", live ? "success" : "warning"),
        heading(live ? (nl ? "Je subdomein staat live" : "Your subdomain is live") : nl ? "Subdomein aangevraagd" : "Subdomain requested"),
        paragraph(hi(nl, o.name)),
        paragraph(live
          ? nl ? `${o.subdomain} wijst nu naar je ROUT-profiel.` : `${o.subdomain} now points to your ROUT profile.`
          : nl ? `We richten ${o.subdomain} in. Dat duurt meestal enkele uren; je krijgt een mail zodra het werkt.` : `We're setting up ${o.subdomain}. This usually takes a few hours; you'll get an e-mail when it works.`),
        actions(button(live ? (nl ? "Bekijk je subdomein" : "Visit your subdomain") : nl ? "Bekijk de status" : "View status", o.url)),
      ],
    }),
  };
}
