import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicCalendar } from "@/lib/calendars.functions";
import BookPublic from "@/components/imported-pages/BookPublic";

/** Sovereign booking page: unguessable id, never reveals the owner. */
export const Route = createFileRoute("/a/$publicId")({
  loader: async ({ params }) => {
    if (!/^[A-Za-z0-9_-]{12,32}$/.test(params.publicId)) throw notFound();
    const cal = await getPublicCalendar({ data: { publicId: params.publicId } });
    if (!cal) throw notFound();
    return cal;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Afspraak boeken" },
      { name: "description", content: "Kies een beschikbaar tijdstip en boek rechtstreeks." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: loaderData?.title ?? "Afspraak boeken" },
      { property: "og:description", content: "Kies een beschikbaar tijdstip en boek rechtstreeks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SovereignCalendar,
});

function SovereignCalendar() {
  const { eventTypeId, title } = Route.useLoaderData();
  if (!eventTypeId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Deze agenda heeft nog geen beschikbare tijden.</p>
      </main>
    );
  }
  return <BookPublic eventTypeId={eventTypeId} />;
}
