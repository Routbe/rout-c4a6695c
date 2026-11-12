import { stripBioLinks } from "@/lib/bio-rules";

export interface ShareSuggestionInput {
  handle: string | null;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

export function cleanHandle(handle: string | null): string {
  return (handle ?? "").replace(/^@+/, "").trim();
}

/** `${naam} (@handle) — ROUT`; zonder naam: `@handle (@handle) — ROUT`. */
export function suggestMetaTitle({ handle, displayName }: ShareSuggestionInput): string {
  const clean = cleanHandle(handle) || "handle";
  return `${displayName.trim() || `@${clean}`} (@${clean}) — ROUT`;
}

/** Bio zonder links (max 200), anders een vaste zin. */
export function suggestMetaDescription({ handle, displayName, bio }: ShareSuggestionInput): string {
  const stripped = (stripBioLinks(bio ?? null) ?? "").trim();
  if (stripped) return stripped.slice(0, 200);
  const name = displayName.trim() || `@${cleanHandle(handle) || "handle"}`;
  return `Bekijk het geverifieerde profiel van ${name} op ROUT.`;
}

/** Avatar, anders de automatische ROUT-kaart. */
export function suggestOgImage({ handle, avatarUrl }: ShareSuggestionInput): string | null {
  if (avatarUrl && /^https?:\/\//.test(avatarUrl)) return avatarUrl;
  const clean = cleanHandle(handle);
  return clean ? `/api/public/og/${clean}.png` : null;
}
