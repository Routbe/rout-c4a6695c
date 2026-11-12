import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route. Er is maar ÉÉN Studio-engine: de vereenvoudigde
 * link-in-bio-editor is verwijderd en deze URL stuurt permanent door naar
 * de volwaardige Workspace Studio.
 */
export const Route = createFileRoute("/_authenticated/studio_/w/$workspaceSlug/hub")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/studio/w/$workspaceSlug/studio",
      params: { workspaceSlug: params.workspaceSlug },
      replace: true,
    });
  },
});
