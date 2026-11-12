/** Copy for the workspace-conversion mails. Unknown languages fall back to English. */
export interface WorkspaceMailCopy {
  subject: string; pre: string; badge: string; title: string; intro: string; steps: string; button: string; urlLabel: string; notice: string;
}
type Pack = { ownerInvite: WorkspaceMailCopy; memberOnboarding: WorkspaceMailCopy };

const PACKS: Record<string, Pack> = {
  nl: {
    ownerInvite: {
      subject: "Neem het eigenaarschap van {name} over // ROUT",
      pre: "Je bent uitgenodigd als eigenaar van een nieuwe ROUT-workspace.",
      badge: "WORKSPACE NODE",
      title: "Word eigenaar van {name}",
      intro: "Een ROUT-account wordt omgezet naar de workspace <strong>{name}</strong> en jij bent aangeduid als nieuwe eigenaar. Links, QR-codes, domeinen, apps en facturatie gaan mee naar de workspace.",
      steps: "Open de link, meld je aan (of maak een account aan) met dit e-mailadres en bevestig. Pas na beide bevestigingen wordt de overdracht uitgevoerd.",
      button: "Eigenaarschap accepteren &rarr;",
      urlLabel: "Of open deze link:",
      notice: "Verwachtte je dit niet? Negeer deze e-mail; er verandert niets zonder jouw akkoord. De link verloopt automatisch.",
    },
    memberOnboarding: {
      subject: "Welkom in je workspace {name} // ROUT",
      pre: "De workspace is klaar en jij hebt toegang.",
      badge: "WORKSPACE NODE",
      title: "Welkom in {name}",
      intro: "De omzetting is voltooid. Je hebt nu toegang tot de workspace <strong>{name}</strong>, met alle links, QR-codes, domeinen en apps.",
      steps: "Het oude account blijft nog 30 dagen bereikbaar als overgangsperiode en wordt daarna automatisch afgesloten.",
      button: "Naar de workspace &rarr;",
      urlLabel: "Of open deze link:",
      notice: "Vragen? Antwoord gewoon op deze e-mail.",
    },
  },
  en: {
    ownerInvite: {
      subject: "Take over ownership of {name} // ROUT",
      pre: "You have been invited as owner of a new ROUT workspace.",
      badge: "WORKSPACE NODE",
      title: "Become the owner of {name}",
      intro: "A ROUT account is being converted into the workspace <strong>{name}</strong> and you were named its new owner. Links, QR codes, domains, apps and billing move to the workspace.",
      steps: "Open the link, sign in (or create an account) with this email address and confirm. The transfer runs only after both sides have confirmed.",
      button: "Accept ownership &rarr;",
      urlLabel: "Or open this link:",
      notice: "Not expecting this? Ignore this email; nothing changes without your consent. The link expires automatically.",
    },
    memberOnboarding: {
      subject: "Welcome to your workspace {name} // ROUT",
      pre: "The workspace is ready and you have access.",
      badge: "WORKSPACE NODE",
      title: "Welcome to {name}",
      intro: "The conversion is complete. You now have access to the workspace <strong>{name}</strong>, with all its links, QR codes, domains and apps.",
      steps: "The old account stays reachable for a 30-day transition period and is then closed automatically.",
      button: "Open the workspace &rarr;",
      urlLabel: "Or open this link:",
      notice: "Questions? Just reply to this email.",
    },
  },
  fr: {
    ownerInvite: {
      subject: "Reprenez la propriété de {name} // ROUT",
      pre: "Vous êtes invité·e comme propriétaire d'un nouvel espace de travail ROUT.",
      badge: "WORKSPACE NODE",
      title: "Devenez propriétaire de {name}",
      intro: "Un compte ROUT est converti en espace de travail <strong>{name}</strong> et vous en êtes désigné·e propriétaire. Liens, codes QR, domaines, apps et facturation y sont transférés.",
      steps: "Ouvrez le lien, connectez-vous (ou créez un compte) avec cette adresse et confirmez. Le transfert n'a lieu qu'après les deux confirmations.",
      button: "Accepter la propriété &rarr;",
      urlLabel: "Ou ouvrez ce lien :",
      notice: "Vous ne vous y attendiez pas ? Ignorez cet e-mail ; rien ne change sans votre accord. Le lien expire automatiquement.",
    },
    memberOnboarding: {
      subject: "Bienvenue dans votre espace {name} // ROUT",
      pre: "L'espace de travail est prêt et vous y avez accès.",
      badge: "WORKSPACE NODE",
      title: "Bienvenue dans {name}",
      intro: "La conversion est terminée. Vous avez maintenant accès à l'espace <strong>{name}</strong>, avec ses liens, codes QR, domaines et apps.",
      steps: "L'ancien compte reste accessible pendant une période de transition de 30 jours, puis il est fermé automatiquement.",
      button: "Ouvrir l'espace &rarr;",
      urlLabel: "Ou ouvrez ce lien :",
      notice: "Des questions ? Répondez simplement à cet e-mail.",
    },
  },
  de: {
    ownerInvite: {
      subject: "Übernimm die Inhaberschaft von {name} // ROUT",
      pre: "Du wurdest als Inhaber·in eines neuen ROUT-Workspace eingeladen.",
      badge: "WORKSPACE NODE",
      title: "Werde Inhaber·in von {name}",
      intro: "Ein ROUT-Konto wird in den Workspace <strong>{name}</strong> umgewandelt, und du wurdest als neue·r Inhaber·in benannt. Links, QR-Codes, Domains, Apps und Abrechnung wechseln in den Workspace.",
      steps: "Öffne den Link, melde dich mit dieser E-Mail-Adresse an (oder erstelle ein Konto) und bestätige. Die Übertragung erfolgt erst nach beiden Bestätigungen.",
      button: "Inhaberschaft annehmen &rarr;",
      urlLabel: "Oder öffne diesen Link:",
      notice: "Nicht erwartet? Ignoriere diese E-Mail; ohne deine Zustimmung ändert sich nichts. Der Link läuft automatisch ab.",
    },
    memberOnboarding: {
      subject: "Willkommen in deinem Workspace {name} // ROUT",
      pre: "Der Workspace ist bereit und du hast Zugriff.",
      badge: "WORKSPACE NODE",
      title: "Willkommen in {name}",
      intro: "Die Umwandlung ist abgeschlossen. Du hast jetzt Zugriff auf den Workspace <strong>{name}</strong> mit allen Links, QR-Codes, Domains und Apps.",
      steps: "Das alte Konto bleibt 30 Tage als Übergangsphase erreichbar und wird danach automatisch geschlossen.",
      button: "Zum Workspace &rarr;",
      urlLabel: "Oder öffne diesen Link:",
      notice: "Fragen? Antworte einfach auf diese E-Mail.",
    },
  },
};

export function workspaceCopyFor(lang: string): Pack {
  return PACKS[lang] ?? PACKS["en"]!;
}
