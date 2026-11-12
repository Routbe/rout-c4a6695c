import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoutLogo } from "@/components/RoutLogo";
import { resolveGoDestination } from "@/lib/go-link.functions";
import { useServerFn } from "@tanstack/react-start";
import { validatedRedirectTarget } from "@/lib/security/redirect-target";

type GoSearch = { i?: string; a?: string; w?: string; to?: string; s?: string };

/** Pick the right destination from the user agent, entirely client-side. */
function pickTarget(ua: string, s: GoSearch): string | undefined {
  if (s.to) return s.to;
  if (/iphone|ipad|ipod/i.test(ua) || (/mac/i.test(ua) && "ontouchend" in document)) {
    return s.i ?? s.w ?? s.a;
  }
  if (/android/i.test(ua)) return s.a ?? s.w ?? s.i;
  return s.w ?? s.i ?? s.a;
}

function GoPage() {
  const search = useSearch({ from: "/go" });
  const [target, setTarget] = useState<string | undefined>();
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const resolve = useServerFn(resolveGoDestination);

  useEffect(() => {
    const s = search as GoSearch;
    const to = validatedRedirectTarget(pickTarget(navigator.userAgent, s)) ?? undefined;
    setTarget(undefined);
    if (!to) return;
    let cancelled = false;
    resolve({ data: { i: s.i, a: s.a, w: s.w, to: s.to, s: s.s, selected: to } })
      .then(r => { if (!cancelled && r.destination) window.location.replace(r.destination); })
      .catch(() => { /* fail closed: no outbound link before verification */ });
    return () => { cancelled = true; };
  }, [search, resolve]);

  if (needsConfirm && target) {
    let host = target;
    let secure = false;
    try {
      const u = new URL(target);
      host = u.host;
      secure = u.protocol === "https:";
    } catch {
      /* keep raw */
    }
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6 text-center">
        <RoutLogo size={26} />
        <h1 className="font-display text-2xl text-foreground">Je verlaat ROUT</h1>
        <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 text-left text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bestemming</p>
            <p className="break-all font-mono text-foreground">{host}</p>
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>{secure ? "✓ Beveiligde verbinding (https)" : "⚠ Geen beveiligde verbinding (geen https)"}</li>
            <li>⚠ De maker van deze link is nog niet geverifieerd bij ROUT</li>
          </ul>
        </div>
        <a
          href={target}
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          ➔ Ga door naar externe site
        </a>
        <p className="max-w-sm text-xs text-muted-foreground">Ga alleen verder als je deze website vertrouwt.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6 text-center">
      <RoutLogo size={26} />
      <h1 className="font-display text-2xl text-foreground">Taking you to the app…</h1>
      {target ? (
        <a href={target} className="text-sm text-foreground underline underline-offset-4">
          Continue manually
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">This link has no destination configured.</p>
      )}
    </div>
  );
}

export const Route = createFileRoute("/go")({
  validateSearch: (search: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(search).filter(([, v]) => typeof v === "string")) as Record<
      string,
      string | undefined
    >,
  head: () => ({
    meta: [
      { title: "Doorverwijzen… | ROUT" },
      {
        name: "description",
        content: "Slimme doorverwijzing naar de juiste app of website voor jouw toestel.",
      },
      { property: "og:title", content: "Doorverwijzen… | ROUT" },
      {
        property: "og:description",
        content: "Slimme doorverwijzing naar de juiste app of website voor jouw toestel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GoPage,
});
