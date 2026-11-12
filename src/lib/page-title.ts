/**
 * One title convention for every ROUT page: `PageName | ROUT - Sovereign Digital Identity OS`.
 *
 * Route heads keep writing their own short titles ("Webhooks | ROUT",
 * "Security — ROUT Developer Console", "ROUT support"); `brandTitle` turns
 * each into the house format at render time, so a new page can never drift.
 * Member pages (og:type "profile") keep the member's own title: that page
 * belongs to their identity, not to ROUT.
 */

export const BRAND = "ROUT - Sovereign Digital Identity OS";
export const TITLE_SEPARATOR = " | ";

/** Product areas that stay visible in the page name, e.g. "Security · Developer Console". */
const AREAS: Record<string, string> = {
  "developer console": "Developer Console",
  console: "Console",
  studio: "Studio",
  beheer: "Beheer",
};

const SEP = String.raw`\s*(?:\||—|–|-|·|:)\s*`;
const TRAILING_BRAND = new RegExp(`${SEP}ROUT(?:\\s+(developer console|console|studio|beheer))?\\s*$`, "i");
const LEADING_BRAND = new RegExp(`^ROUT(?:\\s+(developer console|console|studio|beheer))?${SEP}`, "i");

function capitalise(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

/** Extracts the bare page name from a legacy title. Empty when the title is only the brand. */
export function pageNameFromTitle(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (name === BRAND || name.endsWith(`${TITLE_SEPARATOR}${BRAND}`)) {
    return name === BRAND ? "" : name.slice(0, -(TITLE_SEPARATOR.length + BRAND.length)).trim();
  }
  if (/^ROUT$/i.test(name)) return "";

  let area: string | undefined;
  const trailing = TRAILING_BRAND.exec(name);
  if (trailing) {
    area = trailing[1] ? AREAS[trailing[1].toLowerCase()] : undefined;
    name = name.slice(0, trailing.index).trim();
  } else {
    const leading = LEADING_BRAND.exec(name);
    if (leading) {
      area = leading[1] ? AREAS[leading[1].toLowerCase()] : undefined;
      name = name.slice(leading[0].length).trim();
    } else if (/^ROUT\s+/i.test(name)) {
      // "ROUT support" → "Support"
      name = capitalise(name.replace(/^ROUT\s+/i, ""));
    } else if (/\s+ROUT$/i.test(name) && /^(about|over|à propos de|über)\s/i.test(name)) {
      // "About ROUT" → "About"
      name = name.replace(/\s+ROUT$/i, "");
    }
  }
  if (area && name && !name.toLowerCase().includes(area.toLowerCase())) name = `${name} · ${area}`;
  return name;
}

/** `PageName | ROUT - Sovereign Digital Identity OS`, or just the brand for the home page. */
export function brandTitle(raw: string | null | undefined): string {
  const name = pageNameFromTitle(raw ?? "");
  return name ? `${name}${TITLE_SEPARATOR}${BRAND}` : BRAND;
}

type Tag = { tag: string; attrs?: Record<string, unknown>; children?: string };

const TITLE_META = new Set(["og:title", "twitter:title"]);
export const KNOWLEDGE_GRAPH_SCRIPT_ID = "rout-knowledge-graph";

/** True when the rendered page is a member's own page (their identity, their title). */
export function isMemberPage(tags: readonly Tag[]): boolean {
  return tags.some((t) => t.tag === "meta" && t.attrs?.["property"] === "og:type" && t.attrs?.["content"] === "profile");
}

/**
 * Applies the title convention to the router's head tags and keeps ROUT's own
 * knowledge graph off member pages (a member's custom domain is not rout.be).
 */
export function brandHeadTags<T extends Tag>(tags: readonly T[]): T[] {
  if (isMemberPage(tags)) {
    return tags.filter((t) => !(t.tag === "script" && t.attrs?.["id"] === KNOWLEDGE_GRAPH_SCRIPT_ID));
  }
  return tags.map((t) => {
    if (t.tag === "title" && typeof t.children === "string") return { ...t, children: brandTitle(t.children) };
    if (t.tag === "meta") {
      const key = (t.attrs?.["property"] ?? t.attrs?.["name"]) as string | undefined;
      const content = t.attrs?.["content"];
      if (key && TITLE_META.has(key) && typeof content === "string") {
        return { ...t, attrs: { ...t.attrs, content: brandTitle(content) } };
      }
    }
    return t;
  });
}
