import { createFileRoute } from "@tanstack/react-router";

/** Guest invite downloads require the per-booking token, never the booking id alone. */
export const Route = createFileRoute("/api_/public/booking-ics/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { buildIcs } = await import("@/lib/booking-engine/ics");
        const token = new URL(request.url).searchParams.get("token");
        if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
        // Token check happens in the database (db/0216); a wrong token yields a masked view.
        const { guestView } = await import("@/lib/booking-engine/public.server");
        const v = await guestView(params.id, token);
        if (!v) return new Response("Not found", { status: 404 });
        if (v.masked) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
        if (v.status !== "confirmed") return new Response("Not found", { status: 404 });
        const loc = v.locationValue ?? undefined;
        const ics = buildIcs({
          uid: v.icsUid, sequence: Number(v.sequence), method: "REQUEST",
          startUtc: new Date(v.startUtc), endUtc: new Date(v.endUtc), summary: v.title,
          location: loc, url: v.locationKind === "video" ? loc : undefined,
          organizerEmail: "noreply@rout.be", organizerName: "ROUT", attendeeEmail: v.guestEmail, attendeeName: v.guestName,
        });
        return new Response(ics, {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="rout-afspraak.ics"', "Cache-Control": "private, no-store" },
        });
      },
    },
  },
});
