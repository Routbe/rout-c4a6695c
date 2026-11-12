import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess } from "@/lib/notify";
import { allowedHandlesFor, type GrantTier } from "@/lib/admin-grant-rules";
import { adminGrantVerification, adminListUserWorkspaces } from "@/lib/admin-members.functions";
import { i18n as trI18n } from "@/lib/i18n";

const TIERS: { value: GrantTier; label: string; hint: string }[] = [
  { value: "pro", label: "Pro", hint: "Blauw vinkje, gebruikersnaam op echte naam" },
  { value: "influencer", label: "Influencer", hint: "Echte naam + uitzonderingen die jij toelaat" },
  { value: "business", label: "Bedrijf", hint: "Gedeeld bedrijfsprofiel op website-domein" },
];

export function AdminGrantVerificationDialog({
  userId, open, onOpenChange, onDone,
}: { userId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [tier, setTier] = useState<GrantTier>("pro");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [domain, setDomain] = useState("");
  const [exceptions, setExceptions] = useState("");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || tier !== "business") return;
    adminListUserWorkspaces({ data: { userId } }).then(setWorkspaces).catch(() => setWorkspaces([]));
  }, [open, tier, userId]);

  const exceptionList = tier === "influencer" ? exceptions.split(/[\s,]+/).filter(Boolean) : [];
  const preview = useMemo(
    () => allowedHandlesFor({ tier, firstName, lastName, domain, exceptions: exceptionList }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tier, firstName, lastName, domain, exceptions],
  );

  async function submit() {
    if (!preview.ok) return notifyError(preview.reason);
    setBusy(true);
    try {
      const r = await adminGrantVerification({
        data: {
          userId, tier,
          ...(tier !== "business" ? { firstName, lastName } : { domain }),
          ...(tier === "business" && workspaceId ? { workspaceId } : {}),
          ...(tier === "business" && !workspaceId && workspaceName ? { workspaceName } : {}),
          ...(tier === "influencer" ? { exceptions: exceptionList } : {}),
        },
      });
      if (!r.ok) return notifyError(r.reason);
      notifySuccess("Geverifieerd. Het lid kiest een gebruikersnaam bij de volgende login.");
      onOpenChange(false);
      onDone();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Verifiëren mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lid verifiëren</DialogTitle>
          <DialogDescription>Zonder aanvraag. Het vinkje staat er meteen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-2">
            {TIERS.map((t) => (
              <button key={t.value} type="button" onClick={() => setTier(t.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${tier === t.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>

          {tier !== "business" ? (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="g-first">{trI18n.t("ui.5fecc59844")}</Label><Input id="g-first" value={firstName} onChange={(e) => setFirst(e.target.value)} /></div>
              <div><Label htmlFor="g-last">{trI18n.t("ui.3451206bbd")}</Label><Input id="g-last" value={lastName} onChange={(e) => setLast(e.target.value)} /></div>
            </div>
          ) : (
            <>
              <div><Label htmlFor="g-domain">{trI18n.t("ui.d9e9de5d45")}</Label><Input id="g-domain" placeholder="bakkerij.be" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
              <div>
                <Label htmlFor="g-ws">Workspace</Label>
                <select id="g-ws" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2">
                  <option value="">Nieuwe workspace maken</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {!workspaceId && <Input className="mt-2" placeholder="Naam van het bedrijf" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />}
              </div>
            </>
          )}

          {tier === "influencer" && (
            <div>
              <Label htmlFor="g-exc">Uitzonderingen (gebruikersnamen)</Label>
              <Input id="g-exc" placeholder="djmax, studiojana" value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Alleen deze namen mogen zonder echte naam of cijfers.</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Toegelaten gebruikersnamen</p>
            {preview.ok ? (
              <div className="flex flex-wrap gap-1">{preview.handles.map((h) => <span key={h} className="rounded bg-muted px-2 py-0.5 text-xs">@{h}</span>)}</div>
            ) : <p className="text-xs text-muted-foreground">{preview.reason}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{trI18n.t("ui.c2fbda4ee9")}</Button>
          <Button onClick={submit} disabled={busy || !preview.ok}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Verifiëren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
