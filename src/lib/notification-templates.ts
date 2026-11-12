/**
 * Four-language e-mail + in-app notification copy (NL / EN / FR / DE).
 *
 * Client-safe: pure data and string helpers, no server imports. The same copy
 * feeds the Brevo e-mail and the in-app `notifications` row, so a member never
 * reads two different stories about the same payment.
 */

import { actions, button, heading, layout, paragraph } from "@/emails/kit";

export type NotificationLocale = "nl" | "en" | "fr" | "de";

export const NOTIFICATION_LOCALES: NotificationLocale[] = ["nl", "en", "fr", "de"];

export function asNotificationLocale(value: unknown): NotificationLocale {
  return NOTIFICATION_LOCALES.includes(value as NotificationLocale)
    ? (value as NotificationLocale)
    : "nl";
}

export type NotificationKind =
  | "payment_processing"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "payment_expired"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "transfer_received_unmatched"
  | "transfer_name_mismatch"
  | "account_frozen"
  | "account_unfrozen"
  | "password_changed"
  | "new_device_login"
  | "node_expiry_warning"
  | "node_expiry_final"
  | "merge_verification"
  | "recovery_vault_changed"
  | "recovery_attempt";

interface Copy {
  subject: string;
  title: string;
  body: string;
  cta: string;
}

const CTA: Record<NotificationLocale, string> = {
  nl: "Open je ROUT-dashboard",
  en: "Open your ROUT dashboard",
  fr: "Ouvrir votre tableau de bord ROUT",
  de: "ROUT-Dashboard öffnen",
};

const COPY: Record<NotificationKind, Record<NotificationLocale, Omit<Copy, "cta">>> = {
  payment_processing: {
    nl: {
      subject: "Je SEPA-betaling wordt verwerkt",
      title: "SEPA-betaling onderweg",
      body: "We hebben je opdracht ontvangen. Een SEPA-domiciliëring duurt enkele werkdagen; zodra het bedrag binnen is, lichten je verificatie en badges automatisch op.",
    },
    en: {
      subject: "Your SEPA payment is clearing",
      title: "SEPA payment on its way",
      body: "We received your instruction. A SEPA debit takes a few business days; as soon as it clears, your verification and badges light up automatically.",
    },
    fr: {
      subject: "Votre paiement SEPA est en cours",
      title: "Paiement SEPA en route",
      body: "Nous avons reçu votre instruction. Un prélèvement SEPA prend quelques jours ouvrables ; dès réception, votre vérification et vos badges s'activent automatiquement.",
    },
    de: {
      subject: "Deine SEPA-Zahlung wird verarbeitet",
      title: "SEPA-Zahlung unterwegs",
      body: "Wir haben deinen Auftrag erhalten. Eine SEPA-Lastschrift dauert einige Werktage; sobald der Betrag da ist, werden Verifizierung und Badges automatisch aktiv.",
    },
  },
  payment_succeeded: {
    nl: {
      subject: "Je ROUT-verificatie is actief",
      title: "Betaling ontvangen",
      body: "Bedankt! Je Early Believer-verificatie is actief en je badges staan klaar in je dashboard.",
    },
    en: {
      subject: "Your ROUT verification is live",
      title: "Payment received",
      body: "Thank you! Your Early Believer verification is active and your badges are waiting in your dashboard.",
    },
    fr: {
      subject: "Votre vérification ROUT est active",
      title: "Paiement reçu",
      body: "Merci ! Votre vérification Early Believer est active et vos badges vous attendent dans votre tableau de bord.",
    },
    de: {
      subject: "Deine ROUT-Verifizierung ist aktiv",
      title: "Zahlung erhalten",
      body: "Danke! Deine Early-Believer-Verifizierung ist aktiv und deine Badges warten im Dashboard.",
    },
  },
  payment_failed: {
    nl: {
      subject: "Je betaling is niet gelukt",
      title: "Betaling mislukt",
      body: "De betaling kon niet worden voltooid — vaak door een verlopen kaart of onvoldoende saldo. Je kan het opnieuw proberen vanuit je dashboard.",
    },
    en: {
      subject: "Your payment did not go through",
      title: "Payment failed",
      body: "The payment could not be completed — usually an expired card or insufficient funds. You can try again from your dashboard.",
    },
    fr: {
      subject: "Votre paiement n'a pas abouti",
      title: "Paiement échoué",
      body: "Le paiement n'a pas pu être finalisé — souvent une carte expirée ou un solde insuffisant. Vous pouvez réessayer depuis votre tableau de bord.",
    },
    de: {
      subject: "Deine Zahlung ist fehlgeschlagen",
      title: "Zahlung fehlgeschlagen",
      body: "Die Zahlung konnte nicht abgeschlossen werden — meist eine abgelaufene Karte oder fehlende Deckung. Du kannst es im Dashboard erneut versuchen.",
    },
  },
  payment_refunded: {
    nl: {
      subject: "Je betaling is terugbetaald",
      title: "Terugbetaling bevestigd",
      body: "We hebben je betaling terugbetaald. De bijhorende verificatie en badges zijn daarom weer op vrij niveau gezet.",
    },
    en: {
      subject: "Your payment was refunded",
      title: "Refund confirmed",
      body: "We refunded your payment. The related verification and badges have been reset to the free tier.",
    },
    fr: {
      subject: "Votre paiement a été remboursé",
      title: "Remboursement confirmé",
      body: "Nous avons remboursé votre paiement. La vérification et les badges associés sont repassés au niveau gratuit.",
    },
    de: {
      subject: "Deine Zahlung wurde zurückerstattet",
      title: "Rückerstattung bestätigt",
      body: "Wir haben deine Zahlung zurückerstattet. Verifizierung und Badges wurden auf die kostenlose Stufe zurückgesetzt.",
    },
  },
  subscription_renewed: {
    nl: {
      subject: "Bedankt om ROUT levend te houden",
      title: "Bijdrage vernieuwd",
      body: "Je terugkerende bijdrage is ontvangen. Je Supporter-badge blijft actief — merci!",
    },
    en: {
      subject: "Thanks for keeping ROUT alive",
      title: "Contribution renewed",
      body: "Your recurring contribution came through. Your Supporter badge stays lit — thank you!",
    },
    fr: {
      subject: "Merci de garder ROUT en vie",
      title: "Contribution renouvelée",
      body: "Votre contribution récurrente a été reçue. Votre badge Supporter reste actif — merci !",
    },
    de: {
      subject: "Danke, dass du ROUT am Leben hältst",
      title: "Beitrag verlängert",
      body: "Dein wiederkehrender Beitrag ist eingegangen. Dein Supporter-Badge bleibt aktiv — danke!",
    },
  },
  subscription_cancelled: {
    nl: {
      subject: "Je terugkerende bijdrage is gestopt",
      title: "Bijdrage gestopt",
      body: "Je terugkerende bijdrage is beëindigd. Je levenslange verificatie blijft, enkel de Supporter-badge vervalt.",
    },
    en: {
      subject: "Your recurring contribution stopped",
      title: "Contribution ended",
      body: "Your recurring contribution has ended. Your lifetime verification stays; only the Supporter badge expires.",
    },
    fr: {
      subject: "Votre contribution récurrente est arrêtée",
      title: "Contribution terminée",
      body: "Votre contribution récurrente est terminée. Votre vérification à vie reste ; seul le badge Supporter expire.",
    },
    de: {
      subject: "Dein wiederkehrender Beitrag wurde beendet",
      title: "Beitrag beendet",
      body: "Dein wiederkehrender Beitrag ist beendet. Deine lebenslange Verifizierung bleibt; nur das Supporter-Badge verfällt.",
    },
  },
  payment_expired: {
    nl: {
      subject: "Je betaalsessie is verlopen",
      title: "Betaling verlopen",
      body: "De betaalsessie is verlopen of geannuleerd voor ze afgerond was. Er is niets afgeschreven — je kan de betaling opnieuw starten vanuit je dashboard.",
    },
    en: {
      subject: "Your payment session expired",
      title: "Payment expired",
      body: "The payment session expired or was cancelled before it completed. Nothing was charged — you can start again from your dashboard.",
    },
    fr: {
      subject: "Votre session de paiement a expiré",
      title: "Paiement expiré",
      body: "La session de paiement a expiré ou a été annulée avant d'aboutir. Rien n'a été débité — vous pouvez recommencer depuis votre tableau de bord.",
    },
    de: {
      subject: "Deine Zahlungssitzung ist abgelaufen",
      title: "Zahlung abgelaufen",
      body: "Die Zahlungssitzung ist abgelaufen oder wurde abgebrochen. Es wurde nichts abgebucht — du kannst im Dashboard neu starten.",
    },
  },
  transfer_received_unmatched: {
    nl: {
      subject: "We ontvingen je overschrijving — kenmerk ontbreekt",
      title: "Betaling zonder kenmerk",
      body: "Je overschrijving is binnen, maar de mededeling bevatte geen (geldig) ROUT-kenmerk. Bevestig je kenmerk en we koppelen de betaling meteen aan je account.",
    },
    en: {
      subject: "We received your transfer — reference missing",
      title: "Payment without reference",
      body: "Your transfer arrived, but the message field had no valid ROUT reference. Confirm your reference and we link the payment to your account right away.",
    },
    fr: {
      subject: "Virement reçu — référence manquante",
      title: "Paiement sans référence",
      body: "Votre virement est arrivé, mais la communication ne contenait pas de référence ROUT valide. Confirmez votre référence et nous lions le paiement à votre compte.",
    },
    de: {
      subject: "Überweisung erhalten — Verwendungszweck fehlt",
      title: "Zahlung ohne Referenz",
      body: "Deine Überweisung ist da, aber ohne gültige ROUT-Referenz. Bestätige deine Referenz und wir ordnen die Zahlung sofort deinem Konto zu.",
    },
  },
  transfer_name_mismatch: {
    nl: {
      subject: "Je overschrijving wordt nagekeken",
      title: "Naam of bedrag wijkt af",
      body: "We ontvingen een overschrijving die niet volledig overeenkomt met je account (naam of bedrag wijkt af). Een mens kijkt ernaar; bevestigen kan sneller via je dashboard.",
    },
    en: {
      subject: "Your transfer is being reviewed",
      title: "Name or amount differs",
      body: "We received a transfer that does not fully match your account (name or amount differs). A human is reviewing it; confirming from your dashboard is faster.",
    },
    fr: {
      subject: "Votre virement est en cours de vérification",
      title: "Nom ou montant différent",
      body: "Nous avons reçu un virement qui ne correspond pas entièrement à votre compte (nom ou montant). Une personne le vérifie ; confirmer depuis votre tableau de bord est plus rapide.",
    },
    de: {
      subject: "Deine Überweisung wird geprüft",
      title: "Name oder Betrag weicht ab",
      body: "Wir haben eine Überweisung erhalten, die nicht vollständig zu deinem Konto passt (Name oder Betrag). Ein Mensch prüft das; über dein Dashboard geht es schneller.",
    },
  },
  account_frozen: {
    nl: {
      subject: "Je ROUT-account is gepauzeerd",
      title: "Account gepauzeerd",
      body: "Je account staat op pauze. Je publieke profiel en QR-links zijn tijdelijk offline; je gegevens blijven bewaard. Log in om de pauze op te heffen.",
    },
    en: {
      subject: "Your ROUT account is paused",
      title: "Account paused",
      body: "Your account is paused. Your public profile and QR links are temporarily offline; your data stays intact. Sign in to lift the pause.",
    },
    fr: {
      subject: "Votre compte ROUT est en pause",
      title: "Compte en pause",
      body: "Votre compte est en pause. Votre profil public et vos liens QR sont hors ligne ; vos données restent intactes. Connectez-vous pour reprendre.",
    },
    de: {
      subject: "Dein ROUT-Konto ist pausiert",
      title: "Konto pausiert",
      body: "Dein Konto ist pausiert. Öffentliches Profil und QR-Links sind offline; deine Daten bleiben erhalten. Melde dich an, um fortzufahren.",
    },
  },
  account_unfrozen: {
    nl: {
      subject: "Je ROUT-account is weer actief",
      title: "Account hervat",
      body: "Welkom terug. Je profiel, QR-codes en links staan weer live — precies zoals je ze achterliet.",
    },
    en: {
      subject: "Your ROUT account is live again",
      title: "Account resumed",
      body: "Welcome back. Your profile, QR codes and links are live again — exactly as you left them.",
    },
    fr: {
      subject: "Votre compte ROUT est de nouveau actif",
      title: "Compte réactivé",
      body: "Bon retour. Votre profil, vos QR codes et vos liens sont de nouveau en ligne — tels que vous les aviez laissés.",
    },
    de: {
      subject: "Dein ROUT-Konto ist wieder aktiv",
      title: "Konto reaktiviert",
      body: "Willkommen zurück. Profil, QR-Codes und Links sind wieder live — genau so, wie du sie verlassen hast.",
    },
  },
  password_changed: {
    nl: {
      subject: "Je ROUT-wachtwoord is gewijzigd",
      title: "Wachtwoord gewijzigd",
      body: "Het wachtwoord van je ROUT-account is zojuist aangepast. Was jij dit niet? Pauzeer je account meteen vanuit je dashboard en stel een nieuw wachtwoord in.",
    },
    en: {
      subject: "Your ROUT password was changed",
      title: "Password changed",
      body: "The password on your ROUT account was just updated. Not you? Pause your account from your dashboard right away and set a new password.",
    },
    fr: {
      subject: "Votre mot de passe ROUT a été modifié",
      title: "Mot de passe modifié",
      body: "Le mot de passe de votre compte ROUT vient d'être modifié. Ce n'était pas vous ? Mettez votre compte en pause depuis votre tableau de bord et choisissez un nouveau mot de passe.",
    },
    de: {
      subject: "Dein ROUT-Passwort wurde geändert",
      title: "Passwort geändert",
      body: "Das Passwort deines ROUT-Kontos wurde soeben geändert. Warst du das nicht? Pausiere dein Konto sofort im Dashboard und vergib ein neues Passwort.",
    },
  },
  new_device_login: {
    nl: {
      subject: "Nieuwe aanmelding op je ROUT-account",
      title: "Nieuw apparaat aangemeld",
      body: "Er is ingelogd vanaf een apparaat of IP-adres dat we nog niet kenden. Herken je dit niet? Pauzeer je account en vernieuw je aanmeldgegevens.",
    },
    en: {
      subject: "New sign-in to your ROUT account",
      title: "New device signed in",
      body: "Someone signed in from a device or IP address we had not seen before. Don't recognise it? Pause your account and refresh your credentials.",
    },
    fr: {
      subject: "Nouvelle connexion à votre compte ROUT",
      title: "Nouvel appareil connecté",
      body: "Une connexion a eu lieu depuis un appareil ou une adresse IP inconnue. Vous ne reconnaissez pas ? Mettez votre compte en pause et renouvelez vos identifiants.",
    },
    de: {
      subject: "Neue Anmeldung bei deinem ROUT-Konto",
      title: "Neues Gerät angemeldet",
      body: "Es gab eine Anmeldung von einem bisher unbekannten Gerät oder IP. Kommt dir das fremd vor? Pausiere dein Konto und erneuere deine Zugangsdaten.",
    },
  },
  node_expiry_warning: {
    nl: {
      subject: "Je data wordt binnenkort verwijderd",
      title: "Laatste kans om te exporteren",
      body: "Je node staat op de nominatie om gewist te worden. Exporteer je gegevens vanuit je dashboard of hervat je lidmaatschap voordat de wisdatum verstrijkt.",
    },
    en: {
      subject: "Your data is scheduled for deletion",
      title: "Last chance to export",
      body: "Your node is queued for wiping. Export your data from your dashboard or resume your membership before the wipe date passes.",
    },
    fr: {
      subject: "Vos données vont être supprimées",
      title: "Dernière chance d'exporter",
      body: "Votre node est programmée pour effacement. Exportez vos données depuis votre tableau de bord ou reprenez votre adhésion avant la date d'effacement.",
    },
    de: {
      subject: "Deine Daten werden bald gelöscht",
      title: "Letzte Chance zum Export",
      body: "Deine Node ist zur Löschung vorgemerkt. Exportiere deine Daten im Dashboard oder setze deine Mitgliedschaft fort, bevor das Löschdatum erreicht ist.",
    },
  },
  node_expiry_final: {
    nl: {
      subject: "Nog 24 uur voor je data definitief wist",
      title: "Definitieve wis binnen 24 uur",
      body: "Binnen 24 uur wordt je node onherroepelijk gewist. Daarna is herstel niet meer mogelijk. Exporteer nu je gegevens of hervat je lidmaatschap.",
    },
    en: {
      subject: "24 hours before your data is wiped",
      title: "Permanent wipe within 24 hours",
      body: "Your node will be wiped irreversibly within 24 hours. After that recovery is impossible. Export your data now or resume your membership.",
    },
    fr: {
      subject: "24 heures avant l'effacement définitif",
      title: "Effacement définitif sous 24 heures",
      body: "Votre node sera effacée définitivement d'ici 24 heures. Aucune récupération ne sera possible. Exportez vos données ou reprenez votre adhésion.",
    },
    de: {
      subject: "24 Stunden bis zur endgültigen Löschung",
      title: "Endgültige Löschung in 24 Stunden",
      body: "Deine Node wird in 24 Stunden unwiderruflich gelöscht. Danach ist keine Wiederherstellung möglich. Exportiere jetzt deine Daten oder setze deine Mitgliedschaft fort.",
    },
  },
  merge_verification: {
    nl: {
      subject: "Bevestig het samenvoegen van je accounts",
      title: "Verificatiecode voor samenvoegen",
      body: "Gebruik de code uit je dashboard om beide accounts samen te voegen. De code vervalt na korte tijd. Was jij dit niet? Negeer deze mail — er verandert niets.",
    },
    en: {
      subject: "Confirm your account merge",
      title: "Merge verification code",
      body: "Use the code from your dashboard to merge both accounts. It expires shortly. Not you? Ignore this mail — nothing changes.",
    },
    fr: {
      subject: "Confirmez la fusion de vos comptes",
      title: "Code de vérification de fusion",
      body: "Utilisez le code de votre tableau de bord pour fusionner les deux comptes. Il expire rapidement. Pas vous ? Ignorez ce message — rien ne change.",
    },
    de: {
      subject: "Bestätige das Zusammenführen deiner Konten",
      title: "Verifizierungscode für die Zusammenführung",
      body: "Nutze den Code aus deinem Dashboard, um beide Konten zusammenzuführen. Er läuft bald ab. Nicht du? Ignoriere diese Mail — es ändert sich nichts.",
    },
  },
  recovery_vault_changed: {
    nl: {
      subject: "Je herstelkluis is aangepast",
      title: "Herstelkluis aangepast",
      body: "Je herstelkluis (3 van 5 scherven) is net aangemaakt, vernieuwd of verwijderd. Oude scherven werken niet meer. Was jij dit niet? Zet je account meteen op slot via Account & Beveiliging.",
    },
    en: {
      subject: "Your recovery vault changed",
      title: "Recovery vault changed",
      body: "Your recovery vault (3 of 5 shards) was just created, renewed or removed. Old shards no longer work. Not you? Lock your account right away in Account & Security.",
    },
    fr: {
      subject: "Votre coffre de récupération a changé",
      title: "Coffre de récupération modifié",
      body: "Votre coffre de récupération (3 fragments sur 5) vient d'être créé, renouvelé ou supprimé. Les anciens fragments ne fonctionnent plus. Ce n'était pas vous ? Verrouillez votre compte dans Compte & Sécurité.",
    },
    de: {
      subject: "Dein Wiederherstellungstresor wurde geändert",
      title: "Wiederherstellungstresor geändert",
      body: "Dein Wiederherstellungstresor (3 von 5 Teilen) wurde gerade erstellt, erneuert oder entfernt. Alte Teile funktionieren nicht mehr. Nicht du? Sperre dein Konto sofort unter Konto & Sicherheit.",
    },
  },
  recovery_attempt: {
    nl: {
      subject: "Iemand herstelt je hoofdsleutel",
      title: "Herstelpoging met je scherven",
      body: "Er is net een herstel met je scherven gestart op een toestel dat met je account is ingelogd. Was jij dit niet? Vernieuw je scherven en zet je account op slot via Account & Beveiliging.",
    },
    en: {
      subject: "Someone is restoring your master key",
      title: "Recovery attempt with your shards",
      body: "A recovery with your shards just started on a device signed in to your account. Not you? Renew your shards and lock your account in Account & Security.",
    },
    fr: {
      subject: "Quelqu'un restaure votre clé principale",
      title: "Tentative de récupération avec vos fragments",
      body: "Une récupération avec vos fragments vient de démarrer sur un appareil connecté à votre compte. Ce n'était pas vous ? Renouvelez vos fragments et verrouillez votre compte dans Compte & Sécurité.",
    },
    de: {
      subject: "Jemand stellt deinen Hauptschlüssel wieder her",
      title: "Wiederherstellungsversuch mit deinen Teilen",
      body: "Gerade wurde auf einem Gerät, das mit deinem Konto angemeldet ist, eine Wiederherstellung mit deinen Teilen gestartet. Nicht du? Erneuere deine Teile und sperre dein Konto unter Konto & Sicherheit.",
    },
  },
};

export function notificationCopy(kind: NotificationKind, locale: NotificationLocale): Copy {
  const entry = COPY[kind][locale] ?? COPY[kind].nl;
  return { ...entry, cta: CTA[locale] ?? CTA.nl };
}

export const NOTIFICATION_SEVERITY: Record<NotificationKind, "info" | "success" | "warning"> = {
  payment_processing: "info",
  payment_succeeded: "success",
  payment_failed: "warning",
  payment_refunded: "warning",
  payment_expired: "warning",
  subscription_renewed: "success",
  subscription_cancelled: "info",
  transfer_received_unmatched: "warning",
  transfer_name_mismatch: "warning",
  account_frozen: "info",
  account_unfrozen: "success",
  password_changed: "info",
  new_device_login: "warning",
  node_expiry_warning: "warning",
  node_expiry_final: "warning",
  merge_verification: "info",
  recovery_vault_changed: "warning",
  recovery_attempt: "warning",
};

/**
 * Which Brevo block carries which notification. `notifyUser()` sends the
 * template for the member's language and falls back to the inline HTML below
 * when Brevo has no template for that block yet.
 */
export const NOTIFICATION_EMAIL_CATEGORY: Record<
  NotificationKind,
  | "payment"
  | "payment_confirmation"
  | "payment_issue"
  | "transfer"
  | "security"
  | "merge"
  | "node_expiry"
> = {
  payment_processing: "payment_confirmation",
  payment_succeeded: "payment",
  subscription_renewed: "payment",
  payment_failed: "payment_issue",
  payment_refunded: "payment_issue",
  payment_expired: "payment_issue",
  subscription_cancelled: "payment_issue",
  transfer_received_unmatched: "transfer",
  transfer_name_mismatch: "transfer",
  account_frozen: "security",
  account_unfrozen: "security",
  password_changed: "security",
  new_device_login: "security",
  node_expiry_warning: "node_expiry",
  node_expiry_final: "node_expiry",
  merge_verification: "merge",
  recovery_vault_changed: "security",
  recovery_attempt: "security",
};

/** Shared ROUT e-mail shell — inline styles only, white body, no external CSS. */
export function renderNotificationEmail(copy: Copy, dashboardUrl: string, lang = "nl"): string {
  return layout({
    lang,
    preview: copy.body,
    blocks: [heading(copy.title), paragraph(copy.body), actions(button(copy.cta, dashboardUrl))],
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
