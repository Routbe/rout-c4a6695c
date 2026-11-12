/** Kopletters uit de Studio die de OG-renderer kent (public/fonts/og-*.ttf). */
const FAMILIES: Record<string, string> = {
  "Playfair Display": "og-playfair-display",
  "JetBrains Mono": "og-jetbrains-mono",
  "Space Grotesk": "og-space-grotesk",
  "Cabinet Grotesk": "og-space-grotesk",
  "Instrument Serif": "og-instrument-serif",
  Outfit: "og-outfit",
  "Archivo Black": "og-archivo-black",
  "Cormorant Garamond": "og-cormorant-garamond",
  Caveat: "og-caveat",
  Orbitron: "og-orbitron",
  "Libre Baskerville": "og-libre-baskerville",
  "Bebas Neue": "og-bebas-neue",
};

export const OG_FONT_FILES = [...new Set(Object.values(FAMILIES))].map((f) => `/fonts/${f}.ttf`);

/** Eerste bekende familie uit een CSS font-family-lijst; anders Inter. */
export function ogHeadingFont(cssFamily: string): string {
  for (const part of cssFamily.split(",")) {
    const name = part.trim().replace(/^['"]|['"]$/g, "");
    if (name === "Cabinet Grotesk") return "Space Grotesk";
    if (FAMILIES[name]) return name;
    if (name === "Inter") return "Inter";
  }
  return "Inter";
}
