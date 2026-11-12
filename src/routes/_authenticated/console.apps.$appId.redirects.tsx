import { cleanRedirectUri } from "@/lib/oauth/redirect-match";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { useAppPage } from "@/components/console/useAppPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirectError } from "@/lib/oauth/redirect-rules";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/redirects")({
  head: () => ({ meta: [{"title": "Redirects \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage redirects for your ROUT application."}, {"property": "og:title", "content": "Redirects \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage redirects for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: RedirectsPage,
});

function RedirectsPage() {
  const { appId } = Route.useParams();
  const { app, persist, saving } = useAppPage(appId);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <ConsolePage title="Redirects" description="ROUT stuurt gebruikers enkel terug naar deze callback-URL's.">
      <ConsoleCard>
        <ul className="divide-y divide-border">
          {app.redirectUris.map((uri) => (
            <li key={uri} className="flex items-center gap-2 py-2.5">
              <code className="flex-1 break-all text-xs">{uri}</code>
              <button
                type="button"
                aria-label={`Verwijder ${uri}`}
                disabled={saving || app.redirectUris.length <= 1}
                title={app.redirectUris.length <= 1 ? "Minstens één redirect is verplicht" : undefined}
                onClick={() => persist({ redirectUris: app.redirectUris.filter((r) => r !== uri) })}
                className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const uri = cleanRedirectUri(value);
            const problem = redirectError(uri, app.redirectUris);
            setErr(problem);
            if (problem) return;
            if (await persist({ redirectUris: [...app.redirectUris, uri] })) setValue("");
          }}
        >
          <Input placeholder="https://jouwapp.be/auth/callback" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" disabled={saving}>Toevoegen</Button>
        </form>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      </ConsoleCard>
    </ConsolePage>
  );
}
