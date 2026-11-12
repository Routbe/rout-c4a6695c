import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listMyDomainClaims, releaseDomainClaim, startDomainClaim, verifyDomainClaim } from "@/lib/domain-claims.functions";
import type { DomainClaim } from "@/lib/domain-claims.server";

const STATUS: Record<DomainClaim["status"], string> = {
  pending: "Wacht op DNS",
  verified: "Geverifieerd",
  grace: "Record ontbreekt",
  released: "Vrijgegeven",
};

/** Prove a domain via DNS TXT to unlock the matching handle on rout.be. */
export function DomainClaimPanel() {
  const list = useServerFn(listMyDomainClaims);
  const start = useServerFn(startDomainClaim);
  const verify = useServerFn(verifyDomainClaim);
  const release = useServerFn(releaseDomainClaim);
  const [claims, setClaims] = useState<DomainClaim[] | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setClaims((await list()) as DomainClaim[]);
    } catch {
      setClaims([]);
    }
  }, [list]);
  useEffect(() => void refresh(), [refresh]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Handle claimen via je domein</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bewijs dat je een domein bezit (bv. jouwnaam.be) en krijg de handle rout.be/jouwnaam plus de badge Domein geverifieerd.
        </p>
      </div>
      {(claims ?? []).map((c) => (
        <div key={c.id} className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {c.domain} → rout.be/{c.handle}
            </p>
            <Badge variant={c.status === "verified" ? "default" : "secondary"}>{STATUS[c.status]}</Badge>
          </div>
          {c.status !== "verified" && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Voeg dit TXT-record toe bij je domeinbeheerder:</p>
              <p className="break-all font-mono text-foreground">{c.recordName}</p>
              <p className="break-all font-mono text-foreground">{c.recordValue}</p>
            </div>
          )}
          <div className="flex gap-2">
            {c.status !== "verified" && (
              <Button size="sm" disabled={busy} onClick={() => run(() => verify({ data: { id: c.id } }), "Domein geverifieerd")}>
                Controleer nu
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => release({ data: { id: c.id } }), "Claim verwijderd")}>
              Verwijderen
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="jouwnaam.be" value={domain} onChange={(e) => setDomain(e.target.value)} className="h-10" />
        <Button
          variant="outline"
          disabled={busy || domain.trim().length < 3}
          onClick={() => run(async () => { await start({ data: { domain: domain.trim() } }); setDomain(""); }, "Claim gestart")}
        >
          Claim
        </Button>
      </div>
    </div>
  );
}
