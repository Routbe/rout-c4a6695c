import type { ProfileRecord } from "@/lib/profile";

/**
 * Ingebouwde voorbeeldprofielen achter de landingspagina-vitrine.
 *
 * Dit zijn twee volledig aparte profielen — een gratis alias in de
 * `rout.be/u/…`-namespace en een geverifieerd profiel op de rootnamespace —
 * zodat "Open live profiel" altijd een echte, bestaande pagina opent, ook
 * wanneer de database (nog) niet bereikbaar is.
 */
export interface DemoProfile {
  /** Handle in de URL. */
  handle: string;
  /** true → alias-namespace (`/u/<handle>`), false → root (`/<handle>`). */
  free: boolean;
  record: ProfileRecord;
}

const FREE_DEMO: DemoProfile = {
  handle: "studio",
  free: true,
  record: {
    id: "demo-free",
    username: "studio",
    display_name: "ROUT Studio",
    tagline: "Creatief atelier — boek een sessie of blijf op de hoogte.",
    avatar_url: null,
    theme: "terracotta",
    card_style: "bordered",
    tier: "free",
    verified: false,
    status: "active",
    bio: "Voorbeeldprofiel van een gratis ROUT-alias. Geen echte naam, geen tracking — alleen je links.",
    created_at: "2025-01-14T10:00:00.000Z",
    display_prefs: {
      badgeVisible: false,
      showRoutBadge: true,
      backgroundStyle: "plain",
    },
    blocks: [
      { id: "f1", kind: "newsletter", label: "Nieuwsbrief", value: "" },
      { id: "f2", kind: "web", label: "Cal.com boeking", value: "https://cal.com/rout" },
      { id: "f3", kind: "instagram", label: "Instagram", value: "routstudio" },
      { id: "f4", kind: "web", label: "Pixelfed", value: "https://pixelfed.social/routstudio" },
    ],
  },
};

const VERIFIED_DEMO: DemoProfile = {
  handle: "jdelplanche",
  free: false,
  record: {
    id: "demo-verified",
    username: "jdelplanche",
    display_name: "Jan Delplanche",
    tagline: "Strategic architect — bouwt soevereine software.",
    avatar_url: null,
    theme: "papier",
    card_style: "solid",
    tier: "early_believer",
    verified: true,
    status: "active",
    bio: "Voorbeeldprofiel van een geverifieerd ROUT-lid op de schone rootnamespace, met blauw vinkje en vCard.",
    is_early_believer: true,
    created_at: "2024-11-02T09:00:00.000Z",
    verified_at: "2025-02-01T09:00:00.000Z",
    verified_legal_name: "Jan Delplanche",
    display_prefs: {
      badgeVisible: true,
      showRoutBadge: true,
      backgroundStyle: "plain",
    },
    blocks: [
      { id: "v1", kind: "web", label: "Matrix", value: "https://matrix.to/#/@jan:rout.be" },
      { id: "v2", kind: "web", label: "GitHub", value: "https://github.com/routbe" },
      { id: "v3", kind: "web", label: "Mastodon", value: "https://mastodon.social/@jdelplanche" },
      { id: "v4", kind: "email", label: "Contact opslaan", value: "jan@rout.be" },
    ],
  },
};

export const DEMO_PROFILES: DemoProfile[] = [FREE_DEMO, VERIFIED_DEMO];

/** Pad van een voorbeeldprofiel, bv. `/u/studio` of `/jdelplanche`. */
export function demoProfilePath(demo: DemoProfile): string {
  return demo.free ? `/u/${demo.handle}` : `/${demo.handle}`;
}

/**
 * Zoekt het voorbeeldprofiel voor een handle binnen de juiste namespace.
 * Zonder `free` telt alleen de handle (bv. voor lookups die de namespace
 * niet kennen).
 */
export function findDemoProfile(handle: string, free?: boolean): DemoProfile | null {
  const clean = handle.replace(/^@/, "").toLowerCase();
  const match = DEMO_PROFILES.find(
    (d) => d.handle === clean && (free === undefined || d.free === free),
  );
  return match ?? null;
}
