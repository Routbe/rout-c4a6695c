import { z } from "zod";
import type { EventItem } from "./events";

/** Client-safe rules for Studio-managed events (db/0135 profile_events). */
export const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().default(null),
  venue: z.string().trim().max(200).default(""),
  description: z.string().trim().max(2000).default(""),
  ticketUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//i.test(v), "https_only").default(""),
  published: z.boolean().default(true),
  profileSpace: z.enum(["root", "alias", "workspace"]),
  profileHandle: z.string().trim().toLowerCase().min(1).max(64),
}).refine((d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt), { message: "end_before_start", path: ["endsAt"] });
export type EventInput = z.input<typeof eventInputSchema>;

export type ProfileEvent = {
  id: string; title: string; startsAt: string; endsAt: string | null; venue: string; description: string;
  ticketUrl: string; published: boolean; slug: string; profileSpace: "root" | "alias" | "workspace"; profileHandle: string;
};
export type PublicEvent = Omit<ProfileEvent, "published">;

export const eventPath = (slug: string) => `/event/${encodeURIComponent(slug)}`;

/** An event without an end time counts as running for 4 hours. */
export function eventIsOver(e: { startsAt: string; endsAt: string | null }, now = new Date()): boolean {
  const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 4 * 3600_000);
  return end < now;
}

/** Same rule as read_public_events: only published, not-ended events show on the profile. */
export function eventVisibleOnProfile(e: { published: boolean; startsAt: string; endsAt: string | null }, now = new Date()): boolean {
  return e.published && !eventIsOver(e, now);
}

/** Bridges to the existing .ics / Google Calendar helpers (UTC date + time). */
export function toCalendarItem(e: PublicEvent): EventItem {
  const iso = new Date(e.startsAt).toISOString();
  return { title: e.title, date: iso.slice(0, 10), time: iso.slice(11, 16), venue: e.venue, description: e.description, url: e.ticketUrl, buttonLabel: "Tickets" };
}
