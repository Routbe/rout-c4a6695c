import type { ProfileBlock } from "./profile";
export const PROFILE_SECTION_LABELS = { "widget:questions": "Anonieme Inbox", "widget:guestbook": "Prikbord", "widget:badges": "ROUT Badges", "widget:reach": "Totaal Bereik", "widget:youtube": "YouTube Kaart" } as const;
export type ProfileSectionKind = keyof typeof PROFILE_SECTION_LABELS;
export function isProfileSectionKind(kind: string): kind is ProfileSectionKind { return Object.prototype.hasOwnProperty.call(PROFILE_SECTION_LABELS, kind); }
/** Explicit hidden/scheduled sections suppress legacy placement too. */
export function usesSectionFallback(blocks: ProfileBlock[], kind: ProfileSectionKind): boolean { return !blocks.some((b) => b.kind === kind); }
