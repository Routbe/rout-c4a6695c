import { createFileRoute } from "@tanstack/react-router";
import { ScopeGate } from "@/components/ScopeGate";

export const Route = createFileRoute("/_authenticated/studio_/personal/$feature")({
  head: () => ({ meta: [{ title: "Persoonlijk | ROUT Studio" }, { name: "description", content: "Je persoonlijke ROUT-omgeving." }, { name: "robots", content: "noindex, nofollow" }, { property: "og:title", content: "Persoonlijk | ROUT Studio" }, { property: "og:description", content: "Je persoonlijke ROUT-omgeving." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PersonalScope,
});

function PersonalScope() {
  const { feature } = Route.useParams();
  return <ScopeGate workspaceSlug={null} feature={feature} />;
}
