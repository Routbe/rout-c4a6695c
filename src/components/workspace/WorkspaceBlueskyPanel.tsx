import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkspaceBluesky, linkWorkspaceBlueskyHandle } from "@/lib/workspace-social.functions";

/** Claim a rout.be Bluesky handle for the workspace: <slug>.w.rout.be or <domain>.rout.be. */
export function WorkspaceBlueskyPanel({ workspaceId }: { workspaceId: string }) {
  const read = useServerFn(getWorkspaceBluesky);
  const link = useServerFn(linkWorkspaceBlueskyHandle);
  const [state, setState] = useState<{ handle: string | null; did: string | null; handles: string[] } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void read({ data: { workspaceId } })
      .then((s) => { if (active) { setState(s); setInput(s.handle ?? ""); } })
      .catch(() => { if (active) setState({ handle: null, did: null, handles: [] }); });
    return () => { active = false; };
  }, [read, workspaceId]);

  async function save(handle: string | null) {
    setBusy(true);
    try {
      const r = await link({ data: { workspaceId, handle } });
      if (!r.ok) { toast.error(r.error); return; }
      setState((s) => (s ? { ...s, handle: r.handle, did: r.did } : s));
      toast.success(handle ? "Bluesky-account gekoppeld" : "Bluesky-koppeling verwijderd");
    } finally { setBusy(false); }
  }

  if (!state) return <div className="rounded-2xl border border-border bg-card p-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-base font-medium">Bluesky-handle</h2>
        <p className="text-sm text-muted-foreground">Gebruik het adres van je workspace als Bluesky-handle, met het vinkje van een eigen domein.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Koppel je Bluesky-account</p>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="bedrijf.bsky.social" disabled={busy} aria-label="Huidige Bluesky-handle" />
          <Button onClick={() => void save(input.trim() || null)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Koppelen"}</Button>
        </div>
        {state.did && <p className="inline-flex items-center gap-1 text-sm text-primary"><BadgeCheck className="h-4 w-4" />Gekoppeld{state.handle ? ` aan @${state.handle}` : ""}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Kies je nieuwe handle in Bluesky</p>
        <p className="text-sm text-muted-foreground">
          Ga in Bluesky naar <strong>Instellingen → Account → Handle → Ik heb mijn eigen domein</strong>, kies <strong>Geen DNS-paneel</strong> en vul een van deze adressen in. ROUT bevestigt het automatisch.
        </p>
        {state.handles.map((h) => (
          <div key={h} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs">{h}</code>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" disabled={!state.did} onClick={() => { void navigator.clipboard.writeText(h); setCopied(h); setTimeout(() => setCopied(null), 1500); }}>
              {copied === h ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === h ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
        ))}
        {!state.did && <p className="text-xs text-muted-foreground">Koppel eerst je account in stap 1.</p>}
      </div>
    </section>
  );
}
