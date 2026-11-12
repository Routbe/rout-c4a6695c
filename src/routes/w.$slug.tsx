import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicWorkspace } from "@/lib/workspace-public.functions";
import { seedWorkspaceStudio, workspaceProfileRecord } from "@/lib/workspace-studio";
import { ProfileView } from "@/components/profile/ProfileView";
import { workspacePublicPath } from "@/lib/workspace-rules";
import { jsonLdScript } from "@/lib/social-meta";

export const Route = createFileRoute("/w/$slug")({
  loader: async ({ params }) => {
    const ws = await getPublicWorkspace({ data: { slug: params.slug } });
    if (!ws) throw notFound();
    return ws;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name} op ROUT` : "Workspace niet gevonden — ROUT";
    const description = loaderData
      ? (loaderData.studio?.tagline || loaderData.hub?.tagline || `Officiële ROUT-pagina van ${loaderData.name}: links, QR-codes en contact.`)
      : "Deze workspace bestaat niet of is niet openbaar.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: loaderData ? "summary_large_image" : "summary" },
        ...(loaderData ? [
          { property: "og:image", content: `https://rout.be/api/public/og/${loaderData.slug}.png?space=workspace` },
          { name: "twitter:image", content: `https://rout.be/api/public/og/${loaderData.slug}.png?space=workspace` },
        ] : []),
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      // rel="me" lets Mastodon show the blue check for this page.
      links: (loaderData?.relMe ?? []).map((href) => ({ rel: "me", href })),
      scripts: loaderData
        ? jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: loaderData.name,
            url: `https://rout.be/w/${loaderData.slug}`,
            description,
            ...(loaderData.relMe?.length ? { sameAs: loaderData.relMe } : {}),
          })
        : [],
    };
  },
  component: WorkspacePage,
});

function WorkspacePage() {
  const ws = Route.useLoaderData();
  // Eén renderer: gepubliceerde Studio-pagina, of on-the-fly opgebouwd uit
  // naam, intro en bestaande links — altijd via dezelfde ProfileView.
  const payload = ws.studio ?? seedWorkspaceStudio({ slug: ws.slug, name: ws.name, avatarUrl: ws.avatarUrl }, ws.hub);
  if (!ws.studio && !payload.tagline && ws.description) payload.tagline = ws.description.slice(0, 240);
  return (
    <main className="min-h-screen bg-background">
      <ProfileView profile={workspaceProfileRecord(ws.slug, payload)} free={!ws.domainVerified} publicPath={workspacePublicPath(ws.slug, { name: ws.domain, verified: ws.domainVerified })} />
    </main>
  );
}
