import { createFileRoute } from "@tanstack/react-router";
import { ScopeGate } from "@/components/ScopeGate";

export const Route = createFileRoute("/_authenticated/studio_/w/$workspaceSlug/$feature")({
  head: () => ({ meta: [{ title: "Workspace | ROUT Studio" }, { name: "description", content: "Je ROUT-workspace." }, { name: "robots", content: "noindex, nofollow" }, { property: "og:title", content: "Workspace | ROUT Studio" }, { property: "og:description", content: "Je ROUT-workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WorkspaceScope,
});

function WorkspaceScope() {
  const { workspaceSlug, feature } = Route.useParams();
  return <ScopeGate workspaceSlug={workspaceSlug} feature={feature} />;
}
