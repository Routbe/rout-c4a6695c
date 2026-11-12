import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import BookPublic from "@/components/imported-pages/BookPublic";
import { validBookingStart } from "@/lib/booking-engine/selection";
import { loadBookingInitial } from "@/lib/booking-engine/booking-initial";

export const Route = createFileRoute("/book/$eventTypeId")({
  validateSearch: (search: Record<string, unknown>) => ({ start: validBookingStart(search.start) }),
  beforeLoad: ({ params }) => { if (!z.string().uuid().safeParse(params.eventTypeId).success) throw notFound(); },
  loader: async ({ params }) => {
    const initial = await loadBookingInitial(params.eventTypeId);
    if (!initial.type) throw notFound();
    return { initial };
  },
  head: ({ loaderData }) => ({ meta: [
    { title: loaderData?.initial.type ? `${loaderData.initial.type.title} | ROUT` : "Afspraak inplannen | ROUT" },
    { name: "description", content: "Plan je afspraak op een beschikbaar tijdstip via ROUT." },
    { property: "og:title", content: loaderData?.initial.type ? `${loaderData.initial.type.title} | ROUT` : "Afspraak inplannen | ROUT" },
    { property: "og:description", content: "Plan je afspraak op een beschikbaar tijdstip via ROUT." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EventBookingRoute,
});
function EventBookingRoute() {
  const { eventTypeId } = Route.useParams();
  const { start } = Route.useSearch();
  const { initial } = Route.useLoaderData();
  return <BookPublic key={`${eventTypeId}:${start ?? ""}`} eventTypeId={eventTypeId} selectedStart={start} initial={initial} />;
}