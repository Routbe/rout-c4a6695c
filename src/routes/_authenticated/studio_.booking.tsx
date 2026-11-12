import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old standalone bookings screen: bookings now live in the Studio page switcher. */
export const Route = createFileRoute("/_authenticated/studio_/booking")({
  beforeLoad: () => { throw redirect({ to: "/studio", search: { page: "booking" } as never, replace: true }); },
});
