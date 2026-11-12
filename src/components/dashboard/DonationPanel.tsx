import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, HeartHandshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMyDonations } from "@/lib/donations.functions";
import { canonicalHandle, effectiveUrlStyle, type UrlStyle } from "@/lib/profile-url";
import { i18n as trI18n } from "@/lib/i18n";

const euro = (cents: number) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);

type Summary = Awaited<ReturnType<typeof getMyDonations>>;

/**
 * "Mijn Donatiepagina" — vervangt de upgrade-oproep zodra een lid geverifieerd
 * is: deelbare link + het overzicht van ontvangen steun.
 */
export function DonationPanel({
  handle,
  urlStyle = "u_at",
  verified = true,
}: {
  handle: string | null;
  urlStyle?: UrlStyle;
  verified?: boolean;
}) {
  const load = useServerFn(getMyDonations);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await load().catch(() => null);
      if (alive) {
        setSummary(data);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  if (!handle) return null;

  const clean = canonicalHandle(handle);
  const style = effectiveUrlStyle(urlStyle, verified);
  const base = style === "clean" || style === "clean_at" ? `/${clean}` : `/u/${clean}`;
  const path = `${base}/tip`;
  const url = `https://rout.be${path}`;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2">
        <HeartHandshake className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Mijn Steunpagina</h3>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        Jouw eigen steunpagina — supporters kiezen een bedrag, laten een bericht achter en geven een
        fooi via Bancontact, iDEAL, Apple Pay of kaart.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          rout.be{path}
        </code>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast.success(trI18n.t("ui.f3042d3d49"));
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Kopieer
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href={`${base}/donate`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Bekijk
          </a>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Ontvangen fooien
          </p>
          <p className="text-lg font-medium">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              euro(summary?.totalCents ?? 0)
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Supporters</p>
          <p className="text-lg font-medium">{loading ? "—" : (summary?.count ?? 0)}</p>
        </div>
      </div>

      {(summary?.recent.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-2">
          {summary!.recent.map((row) => (
            <li key={row.id} className="rounded-xl border border-border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.supporterName || "Anoniem"}</span>
                <span className="text-muted-foreground">{euro(row.amountCents)}</span>
              </div>
              {row.message && <p className="mt-1 text-muted-foreground">{row.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
