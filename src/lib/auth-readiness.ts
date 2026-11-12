export type AuthReadiness = { ready: boolean; code: "missing_database" | "missing_secret" | null };

/** Reports configuration only, not database reachability or a successful login. */
export function authConfigurationReadiness(databaseConfigured: boolean, secretConfigured: boolean): AuthReadiness {
  if (!databaseConfigured) return { ready: false, code: "missing_database" };
  if (!secretConfigured) return { ready: false, code: "missing_secret" };
  return { ready: true, code: null };
}

export const AUTH_UNAVAILABLE_TEXT = {
  nl: "Aanmelden is nog niet beschikbaar: de accountdienst is niet volledig verbonden of ingesteld. De beheerder moet de oorspronkelijke accountdatabase en beveiligde instellingen koppelen.",
  en: "Sign-in is not available yet: the account service is not fully connected or configured. The owner needs to connect the original account database and secure settings.",
  fr: "La connexion n’est pas encore disponible : le service de comptes n’est pas complètement connecté ou configuré. Le responsable doit connecter la base de comptes et ses paramètres sécurisés.",
  de: "Die Anmeldung ist noch nicht verfügbar: Der Kontodienst ist nicht vollständig verbunden oder eingerichtet. Der Betreiber muss die ursprüngliche Kontodatenbank und die Sicherheitseinstellungen verbinden.",
};