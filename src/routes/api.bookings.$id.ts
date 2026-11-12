import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/bookings/$id")({ server: { handlers: {
  GET: async ({ request, params }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) return new Response("Invalid booking", { status: 400 });
    const { currentUser } = await import("@/lib/auth/session.server");
    const { readBookingDetails } = await import("@/lib/booking-engine/details.server");
    const user = await currentUser().catch(() => null);
    const result = await readBookingDetails(params.id, new URL(request.url).searchParams.get("token"), user?.id ?? null);
    const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
    if (!result) return Response.json({ error: "Not found" }, { status: 404, headers });
    if (result.forbidden) return Response.json({ error: "Forbidden" }, { status: 403, headers });
    const { forbidden: _, ...details } = result;
    return Response.json(details, { headers });
  },
} } });