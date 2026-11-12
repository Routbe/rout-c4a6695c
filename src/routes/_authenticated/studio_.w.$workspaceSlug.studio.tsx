import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { activateScopeFromUrl } from "@/lib/workspaces.functions";
import { ScopeActivationState, isForbidden } from "@/components/workspace/ScopeActivationState";

export const Route = createFileRoute("/_authenticated/studio_/w/$workspaceSlug/studio")({
  head: () => ({
    meta: [
      { title: "Workspace Studio | ROUT" },
      { name: "description", content: "De volledige ROUT Studio voor deze workspace: inhoud, vormgeving, componenten en audio." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Workspace Studio | ROUT" },
      { property: "og:description", content: "De volledige ROUT Studio voor deze workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceStudioPage,
});

/**
 * Full Studio parity for workspaces: the same StudioCanvas (ProfileEditor)
 * as the personal Studio — same tabs, design options, blocks and the
 * universal audio block — bound to the workspace instead of the member.
 */
function WorkspaceStudioPage() {
  const { workspaceSlug } = Route.useParams();
  const activate = useServerFn(activateScopeFromUrl);
  const qc = useQueryClient();
  const [scope, setScope] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void activate({ data: { workspaceSlug } })
      .then(() => {
        if (!alive) return;
        qc.removeQueries({ queryKey: ["workspace-context"] });
        setScope("ready");
      })
      .catch((e) => alive && setScope(isForbidden(e) ? "denied" : "error"));
    return () => {
      alive = false;
    };
  }, [activate, qc, workspaceSlug, attempt]);

  const crumbs = [{ label: "Studio", to: "/studio" }, { label: workspaceSlug }];
  if (scope === "denied" || scope === "error") {
    return (
      <AppLayout title="Workspace Studio" crumbs={crumbs}>
        <ScopeActivationState kind={scope} onRetry={() => { setScope("loading"); setAttempt((a) => a + 1); }} />
      </AppLayout>
    );
  }
  if (scope === "loading") {
    return (
      <AppLayout title="Workspace Studio" crumbs={crumbs}>
        <p className="text-sm text-muted-foreground">Studio laden…</p>
      </AppLayout>
    );
  }
  return (
    <AppLayout title="Workspace Studio" crumbs={crumbs}>
      <ProfileEditor key={`workspace:${workspaceSlug}`} variant="workspace" workspaceSlug={workspaceSlug} />
    </AppLayout>
  );
}
