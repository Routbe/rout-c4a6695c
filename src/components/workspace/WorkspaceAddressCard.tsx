import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkRootWorkspaceSlug, claimCleanWorkspaceSlug, claimRootWorkspaceSlug, getWorkspaceSettings, renameWorkspaceSlugBase,
  type WorkspaceSettings as WsSettings,
} from "@/lib/workspaces.functions";
import { canManageTeam, workspacePublicPath } from "@/lib/workspace-rules";
import { i18n as trI18n } from "@/lib/i18n";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Er ging iets mis.");

/**
 * Workspace username (editable base + fixed 4-char suffix), clean/root
 * addresses and the live URL. Lives on the Studio Identity tab.
 */
export function WorkspaceAddressCard({ workspaceId }: { workspaceId: string }) {
  const settingsFn = useServerFn(getWorkspaceSettings);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["workspace-settings", workspaceId],
    queryFn: () => settingsFn({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });
  if (!workspaceId || q.isLoading) return <p className="text-sm text-muted-foreground">Adres laden…</p>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Adres kon niet laden.</p>;
  if (!canManageTeam(q.data.role)) {
    const path = workspacePublicPath(q.data.slug, q.data.domain ? { name: q.data.domain.name, verified: q.data.domain.verified } : null);
    return <p className="font-mono text-sm">rout.be{path}</p>;
  }
  return <AddressForm ws={q.data} onDone={() => void qc.invalidateQueries({ queryKey: ["workspace-settings", workspaceId] })} />;
}

function AddressForm({ ws, onDone }: { ws: WsSettings; onDone: () => void }) {
  const claimClean = useServerFn(claimCleanWorkspaceSlug);
  const claimRoot = useServerFn(claimRootWorkspaceSlug);
  const checkRoot = useServerFn(checkRootWorkspaceSlug);
  const renameBase = useServerFn(renameWorkspaceSlugBase);
  const navigate = useNavigate();
  const clean = ws.slug.replace(/-[a-z0-9]{4}$/, "");
  const [slug, setSlug] = useState(clean);
  const [base, setBase] = useState(clean);
  const [root, setRoot] = useState(ws.rootAlias ?? clean);
  const [rootCheck, setRootCheck] = useState<{ value: string; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  // Live availability for the root address.
  useEffect(() => {
    if (!ws.canDropSuffix || !root || root === ws.rootAlias) return;
    const t = setTimeout(() => {
      void checkRoot({ data: { workspaceId: ws.id, slug: root } })
        .then((r) => setRootCheck({ value: root, error: r.error }))
        .catch(() => setRootCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [checkRoot, root, ws.canDropSuffix, ws.id, ws.rootAlias]);

  async function saveClean() {
    setBusy(true);
    try {
      const res = await claimClean({ data: { workspaceId: ws.id, slug } });
      toast.success(trI18n.t("ui.5911eed0b7"));
      void navigate({ to: "/studio/w/$workspaceSlug/studio", params: { workspaceSlug: res.slug }, replace: true });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  async function saveRoot() {
    setBusy(true);
    try { await claimRoot({ data: { workspaceId: ws.id, slug: root } }); toast.success(trI18n.t("ui.9d268709b2")); onDone(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  const live = rootCheck && rootCheck.value === root ? rootCheck : null;
  const suffix = /-([a-z0-9]{4})$/.exec(ws.slug)?.[1] ?? null;
  async function saveBase() {
    setBusy(true);
    try {
      const res = await renameBase({ data: { workspaceId: ws.id, base } });
      toast.success(trI18n.t("ui.f8794c2efc"));
      void navigate({ to: "/studio/w/$workspaceSlug/studio", params: { workspaceSlug: res.slug }, replace: true });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
        <span className="text-muted-foreground">Live adres</span>
        <a href={workspacePublicPath(ws.slug, ws.domain ? { name: ws.domain.name, verified: ws.domain.verified } : null)} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-foreground underline-offset-4 hover:underline">
          rout.be{workspacePublicPath(ws.slug, ws.domain ? { name: ws.domain.name, verified: ws.domain.verified } : null)}
        </a>
        {ws.domain?.verified ? <span className="font-mono text-xs text-muted-foreground">(ook rout.be/w/{ws.slug})</span> : null}
      </div>
      <label className="block space-y-1 text-sm">
        <span>Username</span>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-md border border-input bg-background pr-3 focus-within:ring-2 focus-within:ring-ring">
            <Input value={base} onChange={(e) => setBase(e.target.value.toLowerCase())} aria-label="Username" className="border-0 shadow-none focus-visible:ring-0" />
            {suffix && <span className="shrink-0 font-mono text-muted-foreground">-{suffix}</span>}
          </div>
          <Button onClick={saveBase} disabled={busy || !base || base === clean}>Opslaan</Button>
        </div>
        {suffix && <span className="block text-xs text-muted-foreground">De laatste 4 tekens (-{suffix}) liggen vast; het deel ervoor kies je zelf.</span>}
      </label>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
        {ws.domain?.verified ? (
          <span>Je domein is actief als username: <strong>rout.be/{ws.domain.name}</strong></span>
        ) : (
          <>
            <span className="flex-1">{ws.domain ? `Verifieer ${ws.domain.name} om het als username te gebruiken.` : "Gebruik je eigen domeinnaam als username."}</span>
            <Button size="sm" variant="outline" onClick={() => document.getElementById("workspace-domain")?.scrollIntoView({ behavior: "smooth" })}>
              {ws.domain ? "Domein verifiëren" : "Domein koppelen"}
            </Button>
          </>
        )}
      </div>
      {!ws.canDropSuffix ? (
        <p className="text-sm text-muted-foreground">
          Met Plus, Pro of Early Verified kies je een adres zonder achtervoegsel en een root-adres.
        </p>
      ) : (
        <>
          <label className="block space-y-1 text-sm">
            <span>Schone slug (rout.be/w/…)</span>
            <div className="flex gap-2">
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="Schone slug" />
              <Button onClick={saveClean} disabled={busy || slug === ws.slug}>Schone slug claimen</Button>
            </div>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Root-adres (rout.be/…)</span>
            <div className="flex gap-2">
              <Input value={root} onChange={(e) => setRoot(e.target.value.toLowerCase())} aria-label="Root-adres" />
              <Button onClick={saveRoot} disabled={busy || root === ws.rootAlias || Boolean(live?.error)}>Root-adres claimen</Button>
            </div>
          </label>
          {root !== ws.rootAlias && live && (
            <p className={live.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {live.error ?? `rout.be/${root} is beschikbaar.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

