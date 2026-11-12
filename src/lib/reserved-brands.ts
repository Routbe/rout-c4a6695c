/**
 * Brand protection for every public name on ROUT (handles, aliases, workspace
 * slugs). Client-safe and pure: the same list is seeded into
 * public.reserved_brands (db/0116). Only an admin can release a term, per
 * user, via public.reserved_brand_releases — checked server-side.
 */
export type BrandCategory = "platform" | "brand" | "public_body" | "impersonation";

export const RESERVED_BRANDS: ReadonlyArray<{ term: string; category: BrandCategory; reason: string }> = [
  { term: "rout", category: "platform", reason: "Platformnaam" },
  { term: "routbe", category: "platform", reason: "Platformnaam" },
  { term: "official", category: "impersonation", reason: "Misleidend" },
  { term: "support", category: "impersonation", reason: "Misleidend" },
  { term: "security", category: "impersonation", reason: "Misleidend" },
  { term: "helpdesk", category: "impersonation", reason: "Misleidend" },
  { term: "google", category: "brand", reason: "Beschermd merk" },
  { term: "apple", category: "brand", reason: "Beschermd merk" },
  { term: "microsoft", category: "brand", reason: "Beschermd merk" },
  { term: "github", category: "brand", reason: "Beschermd merk" },
  { term: "meta", category: "brand", reason: "Beschermd merk" },
  { term: "facebook", category: "brand", reason: "Beschermd merk" },
  { term: "instagram", category: "brand", reason: "Beschermd merk" },
  { term: "whatsapp", category: "brand", reason: "Beschermd merk" },
  { term: "tiktok", category: "brand", reason: "Beschermd merk" },
  { term: "youtube", category: "brand", reason: "Beschermd merk" },
  { term: "linkedin", category: "brand", reason: "Beschermd merk" },
  { term: "twitter", category: "brand", reason: "Beschermd merk" },
  { term: "bluesky", category: "brand", reason: "Beschermd merk" },
  { term: "mastodon", category: "brand", reason: "Beschermd merk" },
  { term: "snapchat", category: "brand", reason: "Beschermd merk" },
  { term: "spotify", category: "brand", reason: "Beschermd merk" },
  { term: "stripe", category: "brand", reason: "Beschermd merk" },
  { term: "paypal", category: "brand", reason: "Beschermd merk" },
  { term: "bunq", category: "brand", reason: "Beschermd merk" },
  { term: "kbc", category: "brand", reason: "Beschermd merk" },
  { term: "belfius", category: "brand", reason: "Beschermd merk" },
  { term: "ing", category: "brand", reason: "Beschermd merk" },
  { term: "bnpparibasfortis", category: "brand", reason: "Beschermd merk" },
  { term: "itsme", category: "brand", reason: "Beschermd merk" },
  { term: "proximus", category: "brand", reason: "Beschermd merk" },
  { term: "telenet", category: "brand", reason: "Beschermd merk" },
  { term: "bpost", category: "brand", reason: "Beschermd merk" },
  { term: "nmbs", category: "brand", reason: "Beschermd merk" },
  { term: "belgium", category: "public_body", reason: "Overheid" },
  { term: "belgie", category: "public_body", reason: "Overheid" },
  { term: "vlaanderen", category: "public_body", reason: "Overheid" },
  { term: "wallonie", category: "public_body", reason: "Overheid" },
  { term: "brussel", category: "public_body", reason: "Overheid" },
  { term: "politie", category: "public_body", reason: "Overheid" },
  { term: "overheid", category: "public_body", reason: "Overheid" },
  { term: "europa", category: "public_body", reason: "Overheid" },
];

const BY_TERM = new Map(RESERVED_BRANDS.map((b) => [b.term, b]));

/** Lowercase, strips accents and separators so `G-o_o.gle` matches `google`. */
export function brandKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function isReservedName(slug: string): { reserved: boolean; reason?: string } {
  const key = brandKey(slug);
  if (!key) return { reserved: false };
  const hit = BY_TERM.get(key);
  return hit ? { reserved: true, reason: hit.reason } : { reserved: false };
}
