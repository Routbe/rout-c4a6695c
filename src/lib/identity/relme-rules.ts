/** Pure rel="me" rules: a profile page proves ownership when it links back to the member's ROUT page. */

export function normalizeProfileUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("invalid_profile_url");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/+$/, "");
}

/** Extracts href values of <a>/<link> elements whose rel contains the token "me". */
export function relMeLinks(html: string): string[] {
  const out: string[] = [];
  const tag = /<(?:a|link)\b[^>]*>/gi;
  for (const m of html.slice(0, 2_000_000).matchAll(tag)) {
    const el = m[0];
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(el);
    const relValue = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase().split(/\s+/);
    if (!relValue.includes("me")) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(el);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value) out.push(value.replace(/&amp;/g, "&"));
  }
  return out;
}

/** True when one rel="me" link points exactly at one of the member's ROUT profile URLs. */
export function linksBackTo(html: string, targets: string[]): boolean {
  const wanted = new Set(targets.map((t) => t.toLowerCase().replace(/\/+$/, "")));
  return relMeLinks(html).some((href) => {
    try {
      return wanted.has(normalizeProfileUrl(href).toLowerCase());
    } catch {
      return false;
    }
  });
}
