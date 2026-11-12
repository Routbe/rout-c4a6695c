import { createFileRoute, notFound } from "@tanstack/react-router";
import { getNextBookingSlots } from "@/lib/booking-engine/booking.functions";
import { canonicalLinks, jsonLdScript } from "@/lib/social-meta";
import BookPublic from "@/components/imported-pages/BookPublic";
import { shareCardMeta } from "@/lib/og-action-card";
import { loadBookingInitial } from "@/lib/booking-engine/booking-initial";

/**
 * Linked calendar: the public agenda tied to a member's identity. The handle is
 * resolved against the root username (rout_booking_public_type_for_handle), so
 * the share card is the root booking card, the same as /<handle>/booking.
 */
export const Route = createFileRoute("/u/$username_/agenda")({
  loader: async ({ params }) => {
    const event = await getNextBookingSlots({ data: { handle: params.username.replace(/^@/, ""), eventTypeId: null } });
    if (!event) throw notFound();
    return { eventTypeId: event.eventTypeId, title: event.title, handle: params.username, initial: await loadBookingInitial(event.eventTypeId) };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Agenda van @${loaderData.handle}` : "Agenda" },
      { name: "description", content: "Bekijk beschikbare tijden en boek een afspraak via ROUT." },
      { property: "og:title", content: loaderData ? `Agenda van @${loaderData.handle}` : "Agenda" },
      { property: "og:description", content: "Bekijk beschikbare tijden en boek een afspraak via ROUT." },
      { property: "og:type", content: "website" },
      ...(loaderData ? shareCardMeta(loaderData.handle.replace(/^@/, ""), "booking", "nl", "root") : [{ name: "twitter:card", content: "summary" }]),
    ],
    links: loaderData ? canonicalLinks(`/u/${loaderData.handle.replace(/^@/, "")}/agenda`) : [],
    scripts: loaderData
      ? jsonLdScript({
          "@context": "https://schema.org",
          "@type": "Service",
          name: loaderData.title || `Agenda van @${loaderData.handle}`,
          url: `https://rout.be/u/${loaderData.handle.replace(/^@/, "")}/agenda`,
          provider: { "@type": "Person", alternateName: `@${loaderData.handle.replace(/^@/, "")}`, url: `https://rout.be/u/${loaderData.handle.replace(/^@/, "")}` },
        })
      : [],
  }),
  component: LinkedAgenda,
});

function LinkedAgenda() {
  const { eventTypeId, initial } = Route.useLoaderData();
  return <BookPublic eventTypeId={eventTypeId} initial={initial} />;
}
