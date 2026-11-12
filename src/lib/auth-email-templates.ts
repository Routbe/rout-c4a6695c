/**
 * Four-language authentication e-mail copy (NL / EN / FR / DE).
 *
 * Used by our own auth flow so magic links, confirmations and recovery mails
 * leave ROUT's own domain through Brevo, in the member's own language, with
 * ROUT's own design.
 */
import {
  asNotificationLocale,
  escapeHtml,
  type NotificationLocale,
} from "./notification-templates";

export { asNotificationLocale };

export type AuthEmailAction =
  | "signup"
  | "login"
  | "magiclink"
  | "invite"
  | "recovery"
  | "email_change"
  | "email_change_new"
  | "reauthentication";

interface AuthCopy {
  subject: string;
  title: string;
  body: string;
  cta: string;
  codeLabel: string;
  footer: string;
}

const FOOTER: Record<NotificationLocale, string> = {
  nl: "Heb je dit niet aangevraagd? Dan mag je deze e-mail negeren. De link verloopt binnen 60 minuten.",
  en: "Didn't request this? You can ignore this e-mail. The link expires within 60 minutes.",
  fr: "Vous n'avez rien demandé ? Ignorez cet e-mail. Le lien expire dans 60 minutes.",
  de: "Nicht angefordert? Dann ignoriere diese E-Mail. Der Link läuft in 60 Minuten ab.",
};

const CODE_LABEL: Record<NotificationLocale, string> = {
  nl: "Of gebruik deze code",
  en: "Or use this code",
  fr: "Ou utilisez ce code",
  de: "Oder nutze diesen Code",
};

type Base = Pick<AuthCopy, "subject" | "title" | "body" | "cta">;

const COPY: Record<AuthEmailAction, Record<NotificationLocale, Base>> = {
  signup: {
    nl: {
      subject: "Bevestig je ROUT-account",
      title: "Welkom bij ROUT",
      body: "Bevestig je e-mailadres om je soevereine ROUT-profiel te activeren.",
      cta: "E-mailadres bevestigen",
    },
    en: {
      subject: "Confirm your ROUT account",
      title: "Welcome to ROUT",
      body: "Confirm your e-mail address to activate your sovereign ROUT profile.",
      cta: "Confirm e-mail address",
    },
    fr: {
      subject: "Confirmez votre compte ROUT",
      title: "Bienvenue chez ROUT",
      body: "Confirmez votre adresse e-mail pour activer votre profil ROUT souverain.",
      cta: "Confirmer l'adresse e-mail",
    },
    de: {
      subject: "Bestätige dein ROUT-Konto",
      title: "Willkommen bei ROUT",
      body: "Bestätige deine E-Mail-Adresse, um dein souveränes ROUT-Profil zu aktivieren.",
      cta: "E-Mail-Adresse bestätigen",
    },
  },
  login: {
    nl: {
      subject: "Je ROUT-inlogcode",
      title: "Eenmalige inloglink",
      body: "Klik op de knop om meteen in te loggen op ROUT.",
      cta: "Inloggen bij ROUT",
    },
    en: {
      subject: "Your ROUT sign-in code",
      title: "One-time sign-in link",
      body: "Tap the button to sign in to ROUT right away.",
      cta: "Sign in to ROUT",
    },
    fr: {
      subject: "Votre code de connexion ROUT",
      title: "Lien de connexion unique",
      body: "Cliquez sur le bouton pour vous connecter à ROUT.",
      cta: "Se connecter à ROUT",
    },
    de: {
      subject: "Dein ROUT-Anmeldecode",
      title: "Einmaliger Anmeldelink",
      body: "Klicke auf den Button, um dich direkt bei ROUT anzumelden.",
      cta: "Bei ROUT anmelden",
    },
  },
  magiclink: {
    nl: {
      subject: "Je ROUT-inloglink",
      title: "Eenmalige inloglink",
      body: "Klik op de knop om meteen in te loggen op ROUT.",
      cta: "Inloggen bij ROUT",
    },
    en: {
      subject: "Your ROUT sign-in link",
      title: "One-time sign-in link",
      body: "Tap the button to sign in to ROUT right away.",
      cta: "Sign in to ROUT",
    },
    fr: {
      subject: "Votre lien de connexion ROUT",
      title: "Lien de connexion unique",
      body: "Cliquez sur le bouton pour vous connecter à ROUT.",
      cta: "Se connecter à ROUT",
    },
    de: {
      subject: "Dein ROUT-Anmeldelink",
      title: "Einmaliger Anmeldelink",
      body: "Klicke auf den Button, um dich direkt bei ROUT anzumelden.",
      cta: "Bei ROUT anmelden",
    },
  },
  invite: {
    nl: {
      subject: "Je bent uitgenodigd op ROUT",
      title: "Uitnodiging",
      body: "Iemand nodigde je uit om je ROUT-profiel te claimen. Aanvaard de uitnodiging om te starten.",
      cta: "Uitnodiging aanvaarden",
    },
    en: {
      subject: "You're invited to ROUT",
      title: "Invitation",
      body: "Someone invited you to claim your ROUT profile. Accept the invitation to get started.",
      cta: "Accept invitation",
    },
    fr: {
      subject: "Vous êtes invité sur ROUT",
      title: "Invitation",
      body: "Quelqu'un vous invite à réclamer votre profil ROUT. Acceptez l'invitation pour commencer.",
      cta: "Accepter l'invitation",
    },
    de: {
      subject: "Du bist zu ROUT eingeladen",
      title: "Einladung",
      body: "Jemand hat dich eingeladen, dein ROUT-Profil zu übernehmen. Nimm die Einladung an.",
      cta: "Einladung annehmen",
    },
  },
  recovery: {
    nl: {
      subject: "Stel je ROUT-wachtwoord opnieuw in",
      title: "Wachtwoord opnieuw instellen",
      body: "Klik op de knop om een nieuw wachtwoord voor je ROUT-account te kiezen.",
      cta: "Nieuw wachtwoord kiezen",
    },
    en: {
      subject: "Reset your ROUT password",
      title: "Reset your password",
      body: "Tap the button to choose a new password for your ROUT account.",
      cta: "Choose a new password",
    },
    fr: {
      subject: "Réinitialisez votre mot de passe ROUT",
      title: "Réinitialiser le mot de passe",
      body: "Cliquez sur le bouton pour choisir un nouveau mot de passe ROUT.",
      cta: "Choisir un nouveau mot de passe",
    },
    de: {
      subject: "ROUT-Passwort zurücksetzen",
      title: "Passwort zurücksetzen",
      body: "Klicke auf den Button, um ein neues Passwort für dein ROUT-Konto zu wählen.",
      cta: "Neues Passwort wählen",
    },
  },
  email_change: {
    nl: {
      subject: "Bevestig je nieuwe e-mailadres",
      title: "E-mailadres wijzigen",
      body: "Bevestig de wijziging van je e-mailadres om ze door te voeren.",
      cta: "Wijziging bevestigen",
    },
    en: {
      subject: "Confirm your new e-mail address",
      title: "Change of e-mail address",
      body: "Confirm the change of your e-mail address to apply it.",
      cta: "Confirm change",
    },
    fr: {
      subject: "Confirmez votre nouvelle adresse e-mail",
      title: "Changement d'adresse e-mail",
      body: "Confirmez le changement de votre adresse e-mail pour l'appliquer.",
      cta: "Confirmer le changement",
    },
    de: {
      subject: "Bestätige deine neue E-Mail-Adresse",
      title: "E-Mail-Adresse ändern",
      body: "Bestätige die Änderung deiner E-Mail-Adresse, um sie zu übernehmen.",
      cta: "Änderung bestätigen",
    },
  },
  email_change_new: {
    nl: {
      subject: "Bevestig je nieuwe e-mailadres",
      title: "E-mailadres wijzigen",
      body: "Bevestig de wijziging van je e-mailadres om ze door te voeren.",
      cta: "Wijziging bevestigen",
    },
    en: {
      subject: "Confirm your new e-mail address",
      title: "Change of e-mail address",
      body: "Confirm the change of your e-mail address to apply it.",
      cta: "Confirm change",
    },
    fr: {
      subject: "Confirmez votre nouvelle adresse e-mail",
      title: "Changement d'adresse e-mail",
      body: "Confirmez le changement de votre adresse e-mail pour l'appliquer.",
      cta: "Confirmer le changement",
    },
    de: {
      subject: "Bestätige deine neue E-Mail-Adresse",
      title: "E-Mail-Adresse ändern",
      body: "Bestätige die Änderung deiner E-Mail-Adresse, um sie zu übernehmen.",
      cta: "Änderung bestätigen",
    },
  },
  reauthentication: {
    nl: {
      subject: "Je ROUT-verificatiecode",
      title: "Bevestig dat het jij bent",
      body: "Gebruik onderstaande code om deze gevoelige actie te bevestigen.",
      cta: "Terug naar ROUT",
    },
    en: {
      subject: "Your ROUT verification code",
      title: "Confirm it's you",
      body: "Use the code below to confirm this sensitive action.",
      cta: "Back to ROUT",
    },
    fr: {
      subject: "Votre code de vérification ROUT",
      title: "Confirmez votre identité",
      body: "Utilisez le code ci-dessous pour confirmer cette action sensible.",
      cta: "Retour à ROUT",
    },
    de: {
      subject: "Dein ROUT-Verifizierungscode",
      title: "Bestätige, dass es du bist",
      body: "Nutze den Code unten, um diese sensible Aktion zu bestätigen.",
      cta: "Zurück zu ROUT",
    },
  },
};

export function authEmailAction(raw: unknown): AuthEmailAction {
  const value = String(raw ?? "").toLowerCase();
  return (value in COPY ? value : "magiclink") as AuthEmailAction;
}

export function authEmailCopy(action: AuthEmailAction, locale: NotificationLocale): AuthCopy {
  const base = COPY[action][locale] ?? COPY[action].nl;
  return {
    ...base,
    codeLabel: CODE_LABEL[locale] ?? CODE_LABEL.nl,
    footer: FOOTER[locale] ?? FOOTER.nl,
  };
}

/** ROUT-branded auth e-mail: white body, monospace wordmark, one clear CTA. */
export function renderAuthEmail(copy: AuthCopy, link: string, token?: string | null): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;text-align:left">
        <tr><td style="padding-bottom:20px;font:600 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em">ROUT</td></tr>
        <tr><td style="padding-bottom:8px;font-size:20px;font-weight:600">${escapeHtml(copy.title)}</td></tr>
        <tr><td style="padding-bottom:24px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(copy.body)}</td></tr>
        <tr><td style="padding-bottom:24px">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600">${escapeHtml(copy.cta)}</a>
        </td></tr>
        ${
          token
            ? `<tr><td style="padding-bottom:24px;font-size:13px;color:#475569">${escapeHtml(copy.codeLabel)}:
             <span style="display:inline-block;margin-left:6px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em">${escapeHtml(token)}</span></td></tr>`
            : ""
        }
        <tr><td style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b">${escapeHtml(copy.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
