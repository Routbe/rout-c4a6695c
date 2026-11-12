import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CalendarPlus, MapPin } from "lucide-react";
import { getPublicEvents } from "@/lib/event-engine.functions";
import { eventPath, toCalendarItem, type PublicEvent } from "@/lib/event-engine";

import {
  eventDateBadge,
  eventGoogleUrl,
  eventIcsDataUrl,
  visibleEvents,
  type EventListConfig,
} from "@/lib/events";

/** Publieke agenda: datumbadge, locatie, ticketknop en kalender-pill. */
/**
 * Profile agenda fed by the owner's published, upcoming `profile_events` (db/0135),
 * followed by any hand-written items from an `event_list` block.
 */
export function ProfileEventList({
  handle,
  space,
  config,
  style,
}: {
  handle: string;
  space: "root" | "alias";
  config?: EventListConfig;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const load = useServerFn(getPublicEvents);
  const query = useQuery({
    queryKey: ["public-events", space, handle],
    queryFn: () => load({ data: { space, handle } }),
    retry: false,
    staleTime: 60_000,
  });
  return (
    <EventListCard
      config={config ?? { title: t("profile.upcomingEvents"), items: [], autoHidePast: true }}
      liveEvents={query.data ?? []}
      style={style}
    />
  );
}

export function EventListCard({
  config,
  liveEvents = [],
  style,
}: {
  config: EventListConfig;
  liveEvents?: PublicEvent[];
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const events = visibleEvents(config);
  if (!events.length && !liveEvents.length) return null;

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200/80 p-4 text-left shadow-sm"
      style={style}
    >
      {config.title && <p className="text-sm font-semibold">{config.title}</p>}
      <ul className="mt-3 space-y-3">
        {liveEvents.map((live) => {
          const event = toCalendarItem(live);
          const badge = eventDateBadge(event.date);
          return (
            <li key={live.id} className="flex gap-3">
              <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-border">
                <span className="text-[10px] font-semibold uppercase opacity-70">{badge.month}</span>
                <span className="text-lg font-semibold leading-none">{badge.day}</span>
              </span>
              <div className="min-w-0 flex-1">
                <a href={eventPath(live.slug)} className="block truncate text-sm font-medium hover:underline">{live.title}</a>
                <p className="mt-0.5 flex items-center gap-1 text-xs opacity-70">
                  {new Date(live.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {live.venue && (
                    <>
                      <MapPin className="ml-1 h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{live.venue}</span>
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={eventPath(live.slug)}
                    className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
                  >
                    {t("profile.eventDetails")}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </a>
                  <a
                    href={eventIcsDataUrl(event)}
                    download={`${live.slug}.ics`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  >
                    <CalendarPlus className="h-3 w-3" aria-hidden />
                    {t("profile.agenda")}
                  </a>
                  <a
                    href={eventGoogleUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  >
                    Google
                  </a>
                </div>
              </div>
            </li>
          );
        })}
        {events.map((event, i) => {
          const badge = eventDateBadge(event.date);
          return (
            <li key={`${event.date}-${i}`} className="flex gap-3">
              <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-border">
                <span className="text-[10px] font-semibold uppercase opacity-70">
                  {badge.month}
                </span>
                <span className="text-lg font-semibold leading-none">{badge.day}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{event.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs opacity-70">
                  {event.time}
                  {event.venue && (
                    <>
                      <MapPin className="ml-1 h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{event.venue}</span>
                    </>
                  )}
                </p>
                {event.description && (
                  <p className="mt-1 text-xs opacity-70">{event.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
                    >
                      {event.buttonLabel || t("profile.tickets")}
                    </a>
                  )}
                  <a
                    href={eventIcsDataUrl(event)}
                    download={`${event.title.replace(/[^\w-]+/g, "-").toLowerCase()}.ics`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  >
                    <CalendarPlus className="h-3 w-3" aria-hidden />
                     {t("profile.agenda")} </a>
                  <a
                    href={eventGoogleUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  >
                    Google
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
