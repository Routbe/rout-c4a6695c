/**
 * Platform-wide feature switches (browser-safe catalog).
 *
 * Every switch defaults to ON: a missing row or an unreachable database never
 * turns a feature off by accident. Admins turn features off per platform in
 * /admin/features; the server enforces the switch at each public entry point.
 */
export const PLATFORM_FEATURES = [
  { id: "signup_block", group: "Profielblokken", label: "Inschrijfblok (e-mail)", description: "Bezoekers kunnen zich inschrijven op een profiel." },
  { id: "questions", group: "Profielblokken", label: "Anonieme vragen (Q&A)", description: "Bezoekers kunnen anonieme vragen stellen." },
  { id: "guestbook", group: "Profielblokken", label: "Gastenboek", description: "Geverifieerde leden kunnen een notitie achterlaten." },
  { id: "contact_form", group: "Profielblokken", label: "Contactformulier", description: "Berichten via het contactblok op profielen." },
  { id: "bookings", group: "Profielblokken", label: "Boekingen", description: "Boekingsaanvragen en het boekingssysteem." },
  { id: "feedback", group: "Profielblokken", label: "Feedback & reviews", description: "Antwoorden op feedbackformulieren." },
  { id: "tips", group: "Betalingen", label: "Fooien / tip-pagina's", description: "Betalingen starten op tip-pagina's van makers." },
  { id: "workspaces", group: "Accounts", label: "Nieuwe werkruimtes", description: "Leden kunnen nieuwe werkruimtes (bedrijven, teams) aanmaken." },
  { id: "wallet", group: "Delen", label: "Wallet-passen (Google/Apple)", description: "ROUT Cards en event-passen uitgeven aan Google Wallet en Apple Wallet." },
  { id: "omni_ingest", group: "Studio", label: "Omni-import (URL naar kaart)", description: "Links laten omzetten naar rasterkaarten." },
] as const;

export type PlatformFeatureId = (typeof PLATFORM_FEATURES)[number]["id"];
export type PlatformFeatureMap = Record<PlatformFeatureId, boolean>;

export const isPlatformFeatureId = (value: unknown): value is PlatformFeatureId =>
  typeof value === "string" && PLATFORM_FEATURES.some((f) => f.id === value);

/** Missing rows mean "on"; only an explicit `false` turns a feature off. */
export function resolvePlatformFeatures(rows: Array<{ feature: string; enabled: boolean }>): PlatformFeatureMap {
  const map = Object.fromEntries(PLATFORM_FEATURES.map((f) => [f.id, true])) as PlatformFeatureMap;
  for (const row of rows) if (isPlatformFeatureId(row.feature)) map[row.feature] = row.enabled !== false;
  return map;
}

export const FEATURE_DISABLED_MESSAGE = "Deze functie is tijdelijk uitgeschakeld door ROUT.";
