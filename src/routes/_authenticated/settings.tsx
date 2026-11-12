import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address: the global account page now lives at /studio/account. */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/studio/account${location.searchStr ?? ""}`, replace: true });
  },
});
