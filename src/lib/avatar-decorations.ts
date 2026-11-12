/**
 * Avatar-decoraties & aanwezigheid ("presence") — in de geest van Discord,
 * maar volledig eigen: pure SVG/CSS, geen externe assets, geen tracking.
 *
 * Een decoratie zit *boven* de avatar (kattenoortjes, halo, koptelefoon …) en
 * staat los van het `avatarFrame` (de rand eromheen). Beide worden bewaard in
 * `profiles.display_prefs`.
 */

export type AvatarDecoration =
  | "none"
  | "cat_ears"
  | "bunny_ears"
  | "devil_horns"
  | "angel_halo"
  | "party_hat"
  | "headphones"
  | "cyber_visor"
  | "pixel_crown"
  | "sakura_branch"
  | "leaf_crown"
  | "snow_cap"
  | "flame_tips"
  | "sparkle_dust"
  | "star_orbit"
  | "ghost_pals"
  | "bubble_tea"
  | "bear_ears"
  | "fox_ears"
  | "frog_hat"
  | "butterfly"
  | "flower_crown"
  | "cloud_rainbow"
  | "music_notes"
  | "gamer_wings"
  | "neon_bolts"
  | "robot_antenna"
  | "space_helmet"
  | "moon_crown"
  | "autumn_leaves"
  | "holly"
  | "sun_rays"
  | "ocean_shells"
  | "royal_crown"
  | "diamond_wings"
  | "laurels"
  | "magic_runes"
  | "heart_orbit"
  | "comet_trail"
  | "confetti"
  | "cloud_pals";

export type DecorationCategory = "kawaii" | "gaming" | "seizoen" | "elite";

export type AvatarDecorationDef = {
  id: AvatarDecoration;
  label: string;
  category: DecorationCategory;
  /** Animatieklasse uit styles.css (rout-deco-*). */
  animation?: string;
};

export const AVATAR_DECORATION_DEFS: AvatarDecorationDef[] = [
  { id: "none", label: "Geen", category: "kawaii" },
  { id: "cat_ears", label: "Kattenoortjes", category: "kawaii" },
  { id: "bunny_ears", label: "Konijnenoren", category: "kawaii" },
  { id: "bubble_tea", label: "Bubbelthee", category: "kawaii", animation: "rout-deco-bob" },
  { id: "sparkle_dust", label: "Sterrenstof", category: "kawaii", animation: "rout-deco-twinkle" },
  { id: "bear_ears", label: "Berenoren", category: "kawaii" },
  { id: "fox_ears", label: "Vossenoren", category: "kawaii" },
  { id: "frog_hat", label: "Kikkerhoed", category: "kawaii", animation: "rout-deco-bob" },
  { id: "butterfly", label: "Vlindervriend", category: "kawaii", animation: "rout-deco-float" },
  { id: "flower_crown", label: "Bloemenkroon", category: "kawaii" },
  { id: "cloud_rainbow", label: "Regenboogwolk", category: "kawaii" },

  { id: "headphones", label: "Koptelefoon", category: "gaming" },
  { id: "cyber_visor", label: "Cyber visor", category: "gaming", animation: "rout-deco-scan" },
  { id: "pixel_crown", label: "Pixelkroon", category: "gaming" },
  { id: "ghost_pals", label: "Spookjes", category: "gaming", animation: "rout-deco-float" },
  { id: "music_notes", label: "Muzieknoten", category: "gaming", animation: "rout-deco-float" },
  { id: "gamer_wings", label: "Gamer-vleugels", category: "gaming" },
  { id: "neon_bolts", label: "Neonbliksem", category: "gaming", animation: "rout-deco-flicker" },
  { id: "robot_antenna", label: "Robotantenne", category: "gaming", animation: "rout-deco-twinkle" },
  { id: "space_helmet", label: "Ruimtehelm", category: "gaming" },
  { id: "moon_crown", label: "Maankroon", category: "gaming", animation: "rout-deco-bob" },

  { id: "sakura_branch", label: "Sakura-tak", category: "seizoen" },
  { id: "leaf_crown", label: "Bladerkrans", category: "seizoen" },
  { id: "snow_cap", label: "Sneeuwkap", category: "seizoen" },
  { id: "flame_tips", label: "Vlammen", category: "seizoen", animation: "rout-deco-flicker" },
  { id: "autumn_leaves", label: "Herfstbladeren", category: "seizoen", animation: "rout-deco-float" },
  { id: "holly", label: "Hulsttak", category: "seizoen" },
  { id: "sun_rays", label: "Zonnestralen", category: "seizoen", animation: "rout-deco-pulse" },
  { id: "ocean_shells", label: "Zeeschelpen", category: "seizoen" },

  { id: "angel_halo", label: "Engelenhalo", category: "elite", animation: "rout-deco-bob" },
  { id: "devil_horns", label: "Duivelhoorns", category: "elite" },
  { id: "party_hat", label: "Feesthoed", category: "elite" },
  { id: "star_orbit", label: "Sterrenbaan", category: "elite", animation: "rout-deco-orbit" },
  { id: "royal_crown", label: "Koningskroon", category: "elite" },
  { id: "diamond_wings", label: "Kristalvleugels", category: "elite", animation: "rout-deco-twinkle" },
  { id: "laurels", label: "Gouden lauwerkrans", category: "elite" },
  { id: "magic_runes", label: "Magische runen", category: "elite", animation: "rout-deco-orbit" },
  { id: "heart_orbit", label: "Hartenbaan", category: "elite", animation: "rout-deco-orbit" },
  { id: "comet_trail", label: "Komeetstaart", category: "elite", animation: "rout-deco-float" },
  { id: "confetti", label: "Confettiregen", category: "elite", animation: "rout-deco-twinkle" },
  { id: "cloud_pals", label: "Wolkenvrienden", category: "elite", animation: "rout-deco-float" },
];

export const AVATAR_DECORATION_IDS = AVATAR_DECORATION_DEFS.map((d) => d.id);

export const DECORATION_CATEGORIES: { id: "all" | DecorationCategory; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "kawaii", label: "Kawaii" },
  { id: "gaming", label: "Gaming" },
  { id: "seizoen", label: "Seizoen" },
  { id: "elite", label: "Elite" },
];

export function avatarDecorationDef(id: AvatarDecoration): AvatarDecorationDef {
  return AVATAR_DECORATION_DEFS.find((d) => d.id === id) ?? { id: "none", label: "Geen", category: "kawaii" };
}

export function avatarDecorationLabel(id: AvatarDecoration): string {
  return avatarDecorationDef(id).label;
}

export function normalizeAvatarDecoration(value: unknown): AvatarDecoration {
  return typeof value === "string" && AVATAR_DECORATION_IDS.includes(value as AvatarDecoration)
    ? (value as AvatarDecoration)
    : "none";
}

/* --------------------------------------------------------------- presence */

export type PresenceStatus = "none" | "online" | "idle" | "dnd" | "focus" | "offline";

export type PresenceDef = {
  id: PresenceStatus;
  label: string;
  /** Kleur van het bolletje rechtsonder de avatar. */
  color: string;
  /** Korte omschrijving in de studio. */
  hint: string;
};

export const PRESENCE_DEFS: PresenceDef[] = [
  { id: "none", label: "Verborgen", color: "transparent", hint: "Geen statusbolletje" },
  { id: "online", label: "Online", color: "#22c55e", hint: "Bereikbaar" },
  { id: "idle", label: "Afwezig", color: "#f59e0b", hint: "Even weg" },
  { id: "dnd", label: "Niet storen", color: "#ef4444", hint: "Geen berichten" },
  { id: "focus", label: "Focus", color: "#8b5cf6", hint: "Diep werk" },
  { id: "offline", label: "Offline", color: "#64748b", hint: "Niet bereikbaar" },
];

export function presenceDef(id: PresenceStatus): PresenceDef {
  return PRESENCE_DEFS.find((p) => p.id === id) ?? { id: "none", label: "Verborgen", color: "transparent", hint: "Geen statusbolletje" };
}

export function normalizePresence(value: unknown): PresenceStatus {
  return typeof value === "string" && PRESENCE_DEFS.some((p) => p.id === value)
    ? (value as PresenceStatus)
    : "none";
}
