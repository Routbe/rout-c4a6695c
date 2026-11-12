import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Fingerprint, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyVerifiedClaims } from "@/lib/verified-claims.functions";
import { NO_CLAIMS, TIER_LABELS, trustTier } from "@/lib/verified-claims";

/** "Sovereign Trust & Verificatie": current tier plus the upcoming verification paths. */
export function SovereignTrustWidget() {
  const load = useServerFn(getMyVerifiedClaims);
  const q = useQuery({ queryKey: ["verified-claims"], queryFn: () => load(), retry: false });
  const claims = q.data ?? NO_CLAIMS;
  const tier = trustTier(claims);

  return (
    <section data-testid="sovereign-trust" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck className="h-5 w-5" aria-hidden /> Sovereign Trust &amp; Verificatie
        </h2>
        <Badge variant={tier === 0 ? "secondary" : "default"}>{q.isLoading ? "…" : TIER_LABELS[tier]}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Echte mens</p>
          <p className="text-xs text-muted-foreground">{claims.isVerifiedHuman ? "Bewezen" : "Nog niet bewezen"}</p>
          {!claims.isVerifiedHuman && (
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full gap-2" disabled aria-disabled="true">
              <Fingerprint className="h-4 w-4" aria-hidden /> Verifieer als Echte Mens (via eID/itsme)
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Leeftijd 18+</p>
          <p className="text-xs text-muted-foreground">{claims.isOver18 ? "Bewezen" : "Nog niet bewezen"}</p>
          {!claims.isOver18 && (
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full gap-2" disabled aria-disabled="true">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Verifieer 18+ Leeftijd
            </Button>
          )}
        </div>
      </div>
      {!(claims.isVerifiedHuman && claims.isOver18) && <p className="text-xs text-muted-foreground">Binnenkort beschikbaar.</p>}

      <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
        ROUT slaat nooit je exacte geboortedatum of ID-documenten op. We verifiëren je eenmalig via officiële partners en
        genereren een cryptografisch bewijs (&lsquo;Verifiable Claim&rsquo;). Externe apps kunnen via ROUT controleren of je 18+
        bent, zonder ooit te weten wie je bent of wanneer je geboren bent.
      </p>
    </section>
  );
}
