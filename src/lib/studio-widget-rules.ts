import { newBlockId, type ProfileBlock } from "./profile";
import { PROFILE_SECTION_LABELS } from "./profile-section-blocks";

const SIZED_WIDGET_KINDS = new Set(["live", "audio_player", "media_gallery", "countdown", "newsletter", "feedback", "contact_form", "live_poll"]);

export function isStudioWidget(kind: string): boolean {
  return kind.startsWith("widget:") || SIZED_WIDGET_KINDS.has(kind);
}

/** Enabling an existing widget preserves its position and never duplicates it. */
export function ensureStudioWidget(blocks: ProfileBlock[], kind: string): ProfileBlock[] {
  if (blocks.some((block) => block.kind === kind)) return blocks;
  const label = PROFILE_SECTION_LABELS[kind as keyof typeof PROFILE_SECTION_LABELS] ?? kind;
  return [...blocks, { id: newBlockId(), kind, label, value: "" }];
}