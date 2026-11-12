import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CalendarPlus, MapPin, Wallet } from "lucide-react";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { getPublicEvents } from "@/lib/event-engine.functions";
import { eventIsOver, toCalendarItem, type PublicEvent } from "@/lib/event-engine";
import { eventGoogleUrl, eventIcsDataUrl } from "@/lib/events";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/event/$slug")({
  loader: ({ params }) => getPublicEvents({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const e = loaderData?.[0];
    const title = `${e?.title ?? "Evenement"} | ROUT`;
    const description = e ? `${new Date(e.startsAt).toUTCString().slice(0, 22)}${e.venue ? ` · ${e.venue}` : ""}` : "Evenement op ROUT.";
    return { meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ] };
  },
  component: EventRoute,
});

function EventRoute() {
  const event = Route.useLoaderData()?.[0];
  return <EventPage event={event} />;
}

function EventPage({ event }: { event?: PublicEvent }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  useEffect(() => setUrl(window.location.href), []);
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground"><div className="mx-auto max-w-xl space-y-6">
    <a href="/" className="font-display text-xl">ROUT</a>
    {!event ? <p>{t("events.unavailable")}</p> : <article className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h1 className="text-2xl font-semibold break-words">{event.title}</h1>
      <p className="text-sm text-muted-foreground">{new Date(event.startsAt).toLocaleString()}{event.endsAt && ` – ${new Date(event.endsAt).toLocaleTimeString()}`}{eventIsOver(event) && ` · ${t("events.past")}`}</p>
      {event.venue && <p className="flex items-center gap-1 text-sm"><MapPin className="size-4" aria-hidden />{event.venue}</p>}
      {event.description && <p className="whitespace-pre-line break-words text-sm">{event.description}</p>}
      <div className="flex flex-wrap gap-2">
        {event.ticketUrl && <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Tickets</a>}
        <a href={eventIcsDataUrl(toCalendarItem(event))} download="rout-event.ics" className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><CalendarPlus className="size-4" aria-hidden />{t("events.addCalendar")}</a>
        <a href={eventGoogleUrl(toCalendarItem(event))} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-2 text-sm">Google</a>
        <button type="button" onClick={() => setWalletOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><Wallet className="size-4" aria-hidden />{t("wallet.add")}</button>
      </div>
      <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} kind="event" id={event.slug} />
      {url && <figure className="flex flex-col items-center gap-2 pt-2"><QRCodeSVG value={url} size={160} level="M" bgColor="transparent" fgColor="currentColor" className="text-foreground" aria-label={t("events.scan")} /><figcaption className="text-xs text-muted-foreground">{t("events.scan")}</figcaption></figure>}
    </article>}
  </div></main>;
}
