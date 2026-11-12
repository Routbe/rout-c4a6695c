import type { ProfilePath } from "./content-negotiation";

/**
 * Machine-readable Profile Hub (schema.org ProfilePage + Person JSON-LD).
 * Uses the same public reads and privacy redaction as the HTML page, so it
 * never exposes more than a visitor already sees. Internal ids, legal names
 * of shielded members, relays and e-mail never appear. A private alias never
 * links to the member's verified identity.
 */
export async function machineProfile(path: ProfilePath, origin: string): Promise<Record<string, unknown> | null> {
  const { parseDisplayPrefs } = await import("@/lib/profile-display");
  const { redactPrivateProfile } = await import("@/lib/public-timeline");
  const row =
    path.space === "alias"
      ? await (await import("@/lib/alias-profile.server")).readPublicAliasProfile(path.handle)
      : await (await import("@/lib/studio-profile.server")).readPublicProfile(path.handle);
  if (!row) return null;
  const r = row as Record<string, unknown>;
  const prefs = parseDisplayPrefs(r["display_prefs"]);
  const safe = redactPrivateProfile(r, prefs) as Record<string, unknown>;
  const handle = String(safe["username"] ?? path.handle);
  const url = path.space === "alias" ? `${origin}/u/${handle}` : `${origin}/${handle}`;
  const links = Array.isArray(safe["blocks"])
    ? (safe["blocks"] as Record<string, unknown>[])
        .map((b) => (typeof b["url"] === "string" && /^https:\/\//.test(b["url"]) ? { title: typeof b["title"] === "string" ? b["title"] : null, url: b["url"] } : null))
        .filter((l): l is { title: string | null; url: string } => l !== null)
        .slice(0, 50)
    : [];
  const verifiedHuman = path.space === "alias" ? r["human_linked"] === true : r["verified"] === true;
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    mainEntity: {
      "@type": "Person",
      name: safe["display_name"] ?? null,
      alternateName: `@${handle}`,
      description: safe["tagline"] ?? null,
      image: typeof safe["avatar_url"] === "string" ? safe["avatar_url"] : null,
      url,
      sameAs: links.map((l) => l.url),
    },
    rout: {
      space: path.space === "alias" ? "private_alias" : "verified_profile",
      handle,
      is_private: safe["is_private"] === true,
      verification: { verified_human: verifiedHuman, verified_profile: path.space === "verified" && r["verified"] === true },
      links,
    },
  };
}
