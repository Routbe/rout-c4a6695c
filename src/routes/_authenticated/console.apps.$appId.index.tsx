import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/console/apps/$appId/overview", params, replace: true });
  },
});
