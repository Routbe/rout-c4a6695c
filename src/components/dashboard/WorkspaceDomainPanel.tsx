import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Globe, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkspaceSettings, setWorkspaceDomain, verifyWorkspaceDomain } from "@/lib/workspaces.functions";
import { i18n as trI18n } from "@/lib/i18n";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Workspace equivalent of the personal identity tab: the business claims its
 * own domain with one DNS TXT record, after which the Profile Hub lives at
 * rout.be/<domain> (e.g. rout.be/google.com) — the workspace's verification.
 */
export function WorkspaceDomainPanel({ workspaceId, onVerified }: { workspaceId: string; onVerified?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getWorkspaceSettings);
  const saveDomain = useServerFn(setWorkspaceDomain);
  const verify = useServerFn(verifyWorkspaceDomain);
  const q = useQuery({
    queryKey: ["workspace-domain", workspaceId],
    queryFn: () => load({ data: { workspaceId } }),
  });
  const [input, setInput] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);

  const domain = q.data?.domain ?? null;
  const value = input ?? domain?.name ?? "";

  async function save() {
    setBusy("save");
    try {
      await saveDomain({ data: { workspaceId, domain: value.trim() || null } });
      setInput(null);
      toast.success(trI18n.t("ui.03043a181f"));
      void qc.invalidateQueries({ queryKey: ["workspace-domain", workspaceId] });
    } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }

  async function check() {
    setBusy("verify");
    try {
      const res = await verify({ data: { workspaceId } });
      if (res.verified) {
        toast.success("Domein geverifieerd — je hub is live op rout.be/" + (domain?.name ?? ""));
        void qc.invalidateQueries({ queryKey: ["workspace-domain", workspaceId] });
        onVerified?.();
      } else {
        toast.error(trI18n.t("ui.a47b18c573"));
      }
    } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-medium">Bedrijfsdomein</h2>
        {domain?.verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Geverifieerd
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Claim je eigen domein als workspace-adres. Na verificatie is jullie Profiel Hub bereikbaar via{" "}
        <span className="font-mono text-foreground">rout.be/{domain?.name || "julliedomein.be"}</span> —
        het bewijs dat deze workspace bij jullie organisatie hoort.
      </p>

      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-sm text-muted-foreground">rout.be/</span>
        <Input
          value={value}
          onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
          placeholder="julliedomein.be"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="input-field h-11 min-w-0 flex-1 rounded-xl"
        />
        <Button onClick={() => void save()} disabled={busy !== null || !value.trim()}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Bewaar"}
        </Button>
      </div>

      {domain && !domain.verified && (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">Stap 2 — bewijs eigendom met één DNS-record</p>
          <p className="text-xs text-muted-foreground">
            Voeg bij je DNS-provider (bv. Cloudflare, TransIP) dit TXT-record toe:
          </p>
          <div className="space-y-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(domain.recordName); toast.success(trI18n.t("ui.d0954ac4f4")); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left hover:bg-muted"
            >
              <span className="truncate">Naam: {domain.recordName}</span>
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {domain.recordValue && (
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(domain.recordValue!); toast.success(trI18n.t("ui.d0954ac4f4")); }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left hover:bg-muted"
              >
                <span className="truncate">Waarde: {domain.recordValue}</span>
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            )}
          </div>
          <Button variant="outline" onClick={() => void check()} disabled={busy !== null}>
            {busy === "verify" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />}
            Verifieer domein
          </Button>
        </div>
      )}

      {domain?.verified && (
        <p className="text-xs text-muted-foreground">
          Live adres: <a href={`/${domain.name}`} className="font-mono text-primary underline">rout.be/{domain.name}</a>
        </p>
      )}
    </section>
  );
}
