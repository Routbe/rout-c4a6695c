/**
 * Single source for privacy claims shown by <PrivacyBadge /> and the /security Trust Center.
 * Every statement here must match the code: no hosting location or licence claims until confirmed.
 */
export type PillarId = "zk-pii" | "sovereign-identity" | "zero-trust";

export type Pillar = {
  id: PillarId;
  label: string;
  title: string;
  guarantee: string;
  how: string[];
  stored: string[];
  notStored: string[];
};

type Text = Omit<Pillar, "id">;

const NL: Record<PillarId, Text> = {
  "zk-pii": {
    label: "Zero-Knowledge PII",
    title: "Kalender zonder persoonsgegevens",
    guarantee: "Je agenda-inhoud wordt nooit opgeslagen. We bewaren alleen anonieme vrij/bezet-blokken.",
    how: [
      "Afspraken uit je gekoppelde agenda worden in het geheugen gestript: titel, beschrijving, locatie en genodigden verdwijnen vóór opslag.",
      "Externe afspraak-ID's worden met HMAC gehasht, zodat we ze niet kunnen terugkoppelen.",
      "Vrije tijd wordt per dag bewaard als anonieme UTC-bitmap van 96 kwartierblokken (bit(96)).",
    ],
    stored: ["Begin- en eindtijd van bezette blokken", "Gehashte afspraak-ID", "Bitmap met vrije kwartieren"],
    notStored: ["Titels en beschrijvingen", "Genodigden en e-mailadressen", "Locaties en vergaderlinks"],
  },
  "sovereign-identity": {
    label: "Sovereign Identity",
    title: "Jouw identiteit, jouw toestemming",
    guarantee: "Apps krijgen alleen de gegevens die jij expliciet goedkeurt. Geen trackers, geen verkoop van profieldata.",
    how: [
      "Inloggen via ROUT gebruikt OAuth 2.1 / OpenID Connect met expliciete scopes die je per app goedkeurt.",
      "Sleutels van derden (zoals betaalproviders) worden versleuteld met AES-256-GCM bewaard.",
      "Donaties via de steunpagina gaan met een EPC-QR rechtstreeks naar de bank van de maker, zonder tussenrekening.",
    ],
    stored: ["Je account en de scopes die je goedkeurde", "Versleutelde koppelingssleutels"],
    notStored: ["Advertentie- of trackingprofielen", "Kopieën van donatiegeld", "Gegevens buiten de goedgekeurde scopes"],
  },
  "zero-trust": {
    label: "Zero-Trust Isolation",
    title: "Persoonlijk en workspace strikt gescheiden",
    guarantee: "Persoonlijke gegevens en workspace-gegevens kunnen elkaar niet zien.",
    how: [
      "De actieve omgeving staat in het adres (/studio/personal of /studio/w/<naam>) en wordt bij elk verzoek op de server gecontroleerd tegen je rol.",
      "Bij het wisselen van omgeving wordt alle tijdelijk opgeslagen data in je browser gewist.",
      "Uploads krijgen pas een upload-adres na een servercontrole van plan en opslagquotum.",
    ],
    stored: ["Je rol per workspace", "Bestanden met hun eigen omgeving gelabeld"],
    notStored: ["Gedeelde caches tussen omgevingen"],
  },
};

const EN: Record<PillarId, Text> = {
  "zk-pii": {
    label: "Zero-Knowledge PII",
    title: "A calendar without personal data",
    guarantee: "Your calendar content is never stored. We only keep anonymous free/busy blocks.",
    how: [
      "Events from your connected calendar are stripped in memory: title, description, location and attendees are dropped before storage.",
      "External event IDs are hashed with HMAC so they cannot be linked back.",
      "Free time is stored per day as an anonymous UTC bitmap of 96 quarter-hour blocks (bit(96)).",
    ],
    stored: ["Start and end of busy blocks", "Hashed event ID", "Bitmap of free quarters"],
    notStored: ["Titles and descriptions", "Attendees and email addresses", "Locations and meeting links"],
  },
  "sovereign-identity": {
    label: "Sovereign Identity",
    title: "Your identity, your consent",
    guarantee: "Apps only get the data you explicitly approve. No trackers, no selling of profile data.",
    how: [
      "Sign in with ROUT uses OAuth 2.1 / OpenID Connect with explicit scopes you approve per app.",
      "Third-party keys (such as payment providers) are stored encrypted with AES-256-GCM.",
      "Support page donations go by EPC QR straight to the creator's bank, with no intermediate account.",
    ],
    stored: ["Your account and the scopes you approved", "Encrypted connection keys"],
    notStored: ["Advertising or tracking profiles", "Copies of donated money", "Data outside approved scopes"],
  },
  "zero-trust": {
    label: "Zero-Trust Isolation",
    title: "Personal and workspace strictly separated",
    guarantee: "Personal data and workspace data cannot see each other.",
    how: [
      "The active scope is in the address (/studio/personal or /studio/w/<name>) and checked on the server against your role on every request.",
      "Switching scope wipes all temporarily cached data in your browser.",
      "Uploads only get an upload address after a server check of plan and storage quota.",
    ],
    stored: ["Your role per workspace", "Files labelled with their own scope"],
    notStored: ["Shared caches between scopes"],
  },
};

export const PILLAR_IDS: PillarId[] = ["zk-pii", "sovereign-identity", "zero-trust"];

export function pillar(id: PillarId, locale: string): Pillar {
  const src = locale.startsWith("nl") ? NL : EN;
  return { id, ...src[id] };
}
