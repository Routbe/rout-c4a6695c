import { createFileRoute, redirect } from "@tanstack/react-router";

/** Short event link for QR codes: rout.be/e/<slug> → /event/<slug> (permanent). */
export const Route = createFileRoute("/e/$slug")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/event/$slug", params: { slug: params.slug }, statusCode: 301 });
  },
});
