import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Fingerprint, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyIdentityStatus, startIdentityVerification } from "@/lib/identity/identity.functions";
import { DIDIT_LIMIT_MESSAGE } from "@/lib/identity/identity-rules";
import { i18n as trI18n } from "@/lib/i18n";

const RESULT: Record<string, string> = {
  verified: "Je identiteit is geverifieerd.",
  duplicate_human: "Deze persoon heeft al een geverifieerd ROUT-account.",
  already_verified: "Je account is al geverifieerd.",
  limit_reached: DIDIT_LIMIT_MESSAGE,
  not_configured: "Deze verificatiemethode is nog niet actief.",
  expired: "De verificatie is verlopen. Probeer opnieuw.",
  invalid_name: "We konden geen geldige naam ontvangen van de provider.",
  failed: "Verificatie mislukt. Probeer opnieuw.",
  provider_error: "De verificatiedienst reageert niet. Probeer later opnieuw.",
};

export function IdentityVerification() {
  const status = useQuery({ queryKey: ["identity-status"], queryFn: useServerFn(getMyIdentityStatus) });
  const start = useServerFn(startIdentityVerification);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("identity");
    if (result && result !== "pending" && RESULT[result]) {
      toast[result === "verified" ? "success" : "error"](RESULT[result]);
    } else if (result === "pending") {
      toast.message(trI18n.t("ui.7bc79e9fcf"));
    }
  }, []);

  async function go(provider: "w_identity" | "didit") {
    setBusy(provider);
    try {
      const res = await start({ data: { provider, origin: window.location.origin } });
      if (res.ok) window.location.assign(res.url);
      else toast.error(RESULT[res.reason] ?? RESULT.failed);
    } catch {
      toast.error(RESULT.failed);
    } finally {
      setBusy(null);
    }
  }

  const s = status.data;
  const tier1 = Boolean(s?.tier1RealHuman);
  const tier2 = Boolean(s?.tier2LegalIdentity);
  const spin = <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Fingerprint className="h-5 w-5" aria-hidden /> Verificatie
      </h2>
      {status.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          {s?.isPioneer && !tier2 && (
            <div role="note" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
              <p className="font-semibold">🚀 Pioneer / Early Supporter</p>
              <p className="mt-0.5 text-muted-foreground">
                Als Early Supporter is je paspoortscan via Didit gratis. Verifieer eenmalig om het officiële Blauwe Vinkje te behouden.
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border p-3">
            <h3 className="text-sm font-semibold">1. Wettelijke naam (Blauw Vinkje)</h3>
            {tier2 ? (
              <>
                <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary">
                  <BadgeCheck className="h-4 w-4" aria-hidden /> [✓] Geverifieerde Wettelijke Identiteit
                </p>
                <label className="block text-xs text-muted-foreground" htmlFor="verified-real-name">Officiële naam</label>
                <Input id="verified-real-name" value={s?.verifiedRealName ?? ""} readOnly disabled aria-readonly />
                <p className="text-xs text-muted-foreground">Deze naam komt van je identiteitsbewijs en kan niet gewijzigd worden.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Verifieer je officiële naam met een paspoort- of eID-scan. Eén document geeft maar één blauw vinkje op heel ROUT. We bewaren nooit je documenten.
                </p>
                <Button type="button" onClick={() => go("didit")} disabled={busy !== null || !s?.diditConfigured || !s?.diditAvailable} className="w-full gap-2 sm:w-auto">
                  {busy === "didit" ? spin : <ScanLine className="h-4 w-4" aria-hidden />} Paspoortscan (Didit)
                </Button>
                {s && !s.diditAvailable && <p className="text-xs text-destructive">{DIDIT_LIMIT_MESSAGE}</p>}
                {s && !s.diditConfigured && <p className="text-xs text-muted-foreground">Paspoortscan is nog niet actief.</p>}
              </>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <h3 className="text-sm font-semibold">2. Echt mens (pseudoniem)</h3>
            {tier1 ? (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden /> [🛡️] Geverifieerd Uniek Mens
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Bewijs dat je een uniek mens bent zonder je naam vrij te geven. Daarna kun je op je alias de badge "No Bot / Real Human" tonen.
                </p>
                <Button type="button" variant="outline" onClick={() => go("w_identity")} disabled={busy !== null || !s?.wConfigured} className="w-full gap-2 sm:w-auto">
                  {busy === "w_identity" ? spin : <Fingerprint className="h-4 w-4" aria-hidden />} Via W Identity
                </Button>
                {s && !s.wConfigured && <p className="text-xs text-muted-foreground">W Identity is nog niet actief.</p>}
                <p className="text-xs text-muted-foreground">Een paspoortscan telt ook als bewijs dat je een echt mens bent.</p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
