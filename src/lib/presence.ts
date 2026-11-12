import { z } from "zod";
import { scheduledBlocks, blockHref, type ProfileBlock } from "./profile";
import { normalizeSocialGridTarget, parseSocialGridConfig } from "./social-grid";

export const STATUS_HOURS = 24;
export const MICRO_TEXT_MAX = 280;
export const statusTheme = z.enum(["aurora", "glass"]).default("aurora");
/** Closed style sets; mirrored by db/0191 validate_ephemeral_presence. */
export const PULSE_BGS = ["none", "sunset", "ocean", "forest", "noir", "candy", "gold"] as const;
export const PULSE_FONTS = ["classic", "display", "mono", "hand"] as const;
export const PULSE_ALIGNS = ["left", "center", "right"] as const;
export const PULSE_STICKERS = ["🔥", "✨", "💬", "🎧", "🎮", "📍", "☕", "💻", "🎉", "😴", "❤️", "👀"] as const;
export type PulseBg = typeof PULSE_BGS[number]; export type PulseFont = typeof PULSE_FONTS[number]; export type PulseAlign = typeof PULSE_ALIGNS[number];
const key = z.string().min(1).max(100);
export const statusInput = z.discriminatedUnion("statusType", [
  z.object({ id: z.string().uuid(), space: z.enum(["root", "alias"]), statusType: z.literal("micro_text"), payload: z.object({ text: z.string().trim().min(1).refine(s => [...s].length <= MICRO_TEXT_MAX, "max_280"), theme: statusTheme, bg: z.enum(PULSE_BGS).optional(), font: z.enum(PULSE_FONTS).optional(), align: z.enum(PULSE_ALIGNS).optional(), sticker: z.enum(PULSE_STICKERS).optional() }).strict() }).strict(),
  z.object({ id: z.string().uuid(), space: z.enum(["root", "alias"]), statusType: z.literal("omni_drop"), payload: z.object({ blockId: key, itemId: key.optional() }).strict() }).strict(),
]);
export type StatusInput = z.infer<typeof statusInput>;
export type PresenceStory = {
  id: string; statusType: "qa_reply" | "micro_text" | "omni_drop";
  createdAt: string; expiresAt: string; theme?: "aurora" | "glass";
  bg?: PulseBg | null; font?: PulseFont | null; align?: PulseAlign | null; sticker?: string | null;
  text?: string; question?: string; answer?: string; prompt?: string | null;
  blockId?: string; title?: string; targetUrl?: string; mediaUrl?: string; badge?: string;
  pending?: boolean;
};
export const presenceKey = (space: string, handle: string) => ["presence", space, handle.toLowerCase()] as const;
export function activePresence(stories: PresenceStory[], now: number): PresenceStory[] {
  return stories.filter(s => Number.isFinite(Date.parse(s.expiresAt)) && Date.parse(s.expiresAt) > now)
    .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
/** Spotlight candidates are the existing blocks, not a second library. */
export type SpotlightCandidate = { blockId: string; itemId?: string; title: string; targetUrl: string; mediaUrl?: string };
export function spotlightCandidates(blocks: ProfileBlock[], now = Date.now()): SpotlightCandidate[] {
  return scheduledBlocks(blocks, now).flatMap<SpotlightCandidate>(block => {
    if (block.kind === "social_grid") return parseSocialGridConfig(block.value).items.flatMap(item => item.targetUrl ? [{ blockId: block.id, itemId: item.id, title: item.caption || block.label, targetUrl: item.targetUrl, mediaUrl: item.mediaUrl }] : []);
    const href = normalizeSocialGridTarget(blockHref(block));
    return href ? [{ blockId: block.id, itemId: undefined, title: block.label, targetUrl: href, mediaUrl: block.thumbnailUrl }] : [];
  });
}
/** Explicit JSON-only endpoint: no multipart, binary, unbounded input or extra fields. */
export async function readStatusJson(request: Request): Promise<StatusInput> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw Object.assign(new Error("json_only"), { statusCode: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("empty_payload"), { statusCode: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 8192) { await reader.cancel(); throw Object.assign(new Error("payload_too_large"), { statusCode: 413 }); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return statusInput.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}