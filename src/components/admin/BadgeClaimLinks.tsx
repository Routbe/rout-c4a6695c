import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminCreateClaimLink, adminListClaimLinks, adminRevokeClaimLink } from "@/lib/badge-claims.functions";
import { isAdminMode } from "@/lib/app-mode";
import { notifyError, notifySuccess } from "@/lib/notify";

type LinkRow = Awaited<ReturnType<typeof adminListClaimLinks>>[number];

/** Claim links always point at the public site, also when created on the admin portal. */
function publicBase() {
  const env = import.meta.env["VITE_PUBLIC_SITE_URL"] as string | undefined;
  if (env) return env.replace(/\/$/, "");
  return isAdminMode() || typeof window === "undefined" ? "https://rout.be" : window.location.origin;
}

export function BadgeClaimLinks({ badgeId }: { badgeId: string }) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [max, setMax] = useState("50");
  const [expires, setExpires] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);

  const load = useCallback(() => {
    adminListClaimLinks({ data: { badgeId } }).then(setLinks).catch(() => undefined);
  }, [badgeId]);
  useEffect(load, [load]);

  async function create() {
    const maxClaims = max.trim() ? Number(max) : null;
    const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : null;
    if (maxClaims != null && (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 100_000)) return notifyError("Kies tussen 1 en 100.000 claims.");
    if (maxClaims == null && !expiresAt) return notifyError("Stel een maximum aantal claims of een vervaldatum in.");
    setBusy(true);
    try {
      const r = await adminCreateClaimLink({ data: { badgeId, maxClaims, expiresAt, reason: reason.trim() || null } });
      setShown(r.token);
      notifySuccess("Claim-link aangemaakt");
      load();
    } catch {
      notifyError("Aanmaken mislukt");
    } finally {
      setBusy(false);
    }
  }

  const url = (t: string) => `${publicBase()}/claim/${t}`;

  return (
    <section className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Claim-links (QR in de echte wereld)</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor="cl-max">Max. claims</Label>
          <Input id="cl-max" type="number" min={1} max={100000} value={max} onChange={(e) => setMax(e.target.value)} placeholder="Onbeperkt" />
        </div>
        <div>
          <Label htmlFor="cl-exp">Vervalt op</Label>
          <Input id="cl-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cl-reason">Reden</Label>
          <Input id="cl-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="bv. Opendeurdag 2026" />
        </div>
      </div>
      <Button onClick={() => void create()} disabled={busy}>
        <Link2 className="mr-1.5 h-4 w-4" aria-hidden /> Genereer Claim Link
      </Button>

      {shown && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
          <div className="rounded-lg bg-background p-2 text-foreground">
            <QRCodeSVG value={url(shown)} size={120} level="M" marginSize={0} bgColor="transparent" fgColor="currentColor" aria-label="QR van de claim-link" />
          </div>
          <code className="min-w-0 flex-1 break-all text-xs">{url(shown)}</code>
        </div>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <Button variant="link" className="h-auto max-w-full whitespace-normal break-all p-0 text-left font-mono text-xs" onClick={() => setShown(l.token)}>
                  {l.token}
                </Button>
                <span className="block text-xs text-muted-foreground">
                  {l.claims}/{l.maxClaims ?? "∞"} geclaimd
                  {l.expiresAt && ` · tot ${new Date(l.expiresAt).toLocaleDateString("nl-BE")}`}
                  {l.revoked && " · ingetrokken"}
                  {l.reason && ` · ${l.reason}`}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" aria-label="Link kopiëren" onClick={() => void navigator.clipboard.writeText(url(l.token)).then(() => notifySuccess("Gekopieerd"))}>
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
                {!l.revoked && (
                  <Button size="sm" variant="ghost" aria-label="Intrekken" onClick={() => void adminRevokeClaimLink({ data: { id: l.id } }).then(load)}>
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
