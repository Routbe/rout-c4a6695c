/**
 * Which bio text proves a social account belongs to a workspace: its ROUT
 * address (rout.be/w/<slug>) or, once verified, its own domain.
 */
export function workspaceBioNeedles(slug: string, verifiedDomain: string | null): string[] {
  const s = slug.trim().toLowerCase();
  const needles = s ? [`rout.be/w/${s}`] : [];
  const d = verifiedDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (d) needles.push(`rout.be/${d}`, d);
  return needles;
}

export function bioProvesWorkspace(bio: string, slug: string, verifiedDomain: string | null): boolean {
  const hay = bio.toLowerCase().replace(/\s+/g, "");
  return workspaceBioNeedles(slug, verifiedDomain).some((n) => hay.includes(n));
}
