/** Custom live status: payload validation and privacy rules. Pure and browser-safe. */
import { z } from "zod";

export const PRESENCE_CATEGORIES = ["music", "coding", "gaming", "custom"] as const;
export const PRESENCE_TTL_SECONDS = 15;
export const MAX_EXPIRE_MINUTES = 7 * 24 * 60;

export const presencePayloadSchema = z.object({
  status_text: z.string().trim().min(1).max(140),
  icon: z.string().trim().max(16).optional(),
  expires_in_minutes: z.number().int().min(1).max(MAX_EXPIRE_MINUTES).optional(),
  category: z.enum(PRESENCE_CATEGORIES).optional(),
  metadata: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).optional()
    .refine((m) => !m || Object.keys(m).length <= 10, "Max 10 metadata keys"),
});
export type PresencePayload = z.infer<typeof presencePayloadSchema>;

export interface PresenceRules {
  /** 0 = Sunday … 6 = Saturday: days the status is hidden. */
  stealthDays: number[];
  /** Working hours in local time (0-24); outside them the status is hidden. Null = always visible. */
  workStart: number | null;
  workEnd: number | null;
  timeZone: string;
  hideExplicit: boolean;
}

export const DEFAULT_RULES: PresenceRules = { stealthDays: [], workStart: null, workEnd: null, timeZone: "Europe/Brussels", hideExplicit: false };

export interface StoredStatus {
  statusText: string;
  icon: string | null;
  category: (typeof PRESENCE_CATEGORIES)[number];
  expiresAt: string | null;
  explicit?: boolean;
}

function localParts(now: Date, timeZone: string): { day: number; hour: number } {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
    const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts["weekday"] ?? "");
    return { day, hour: Number(parts["hour"]) };
  } catch {
    return { day: now.getUTCDay(), hour: now.getUTCHours() };
  }
}

/** True when stealth mode hides every live status right now. */
export function isStealth(rules: PresenceRules, now: Date): boolean {
  const { day, hour } = localParts(now, rules.timeZone);
  if (rules.stealthDays.includes(day)) return true;
  if (rules.workStart !== null && rules.workEnd !== null && rules.workStart !== rules.workEnd) {
    const inside = rules.workStart < rules.workEnd
      ? hour >= rules.workStart && hour < rules.workEnd
      : hour >= rules.workStart || hour < rules.workEnd;
    if (!inside) return true;
  }
  return false;
}

/** What visitors may see: null when expired, stealthed or filtered as explicit. */
export function visibleStatus(status: StoredStatus | null, rules: PresenceRules, now: Date): StoredStatus | null {
  if (!status) return null;
  if (status.expiresAt && Date.parse(status.expiresAt) <= now.getTime()) return null;
  if (isStealth(rules, now)) return null;
  if (rules.hideExplicit && status.explicit) return null;
  return status;
}

export function expiresAtFor(minutes: number | undefined, now: Date): string | null {
  return minutes ? new Date(now.getTime() + minutes * 60_000).toISOString() : null;
}
