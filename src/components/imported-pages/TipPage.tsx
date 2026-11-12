import { PrivacyBadge } from "@/components/PrivacyBadge";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Check, CheckCircle2, Copy, CreditCard, Landmark, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { buildEpcPayload } from "@/lib/epc-qr";
import { fetchTipSocialImages, getPublicTipPage, startTipPayment } from "@/lib/tip-page.functions";
import { ExternalTipButton } from "@/components/tip/ExternalTipButton";
import { proxied } from "@/lib/image-proxy-rules";
import { TIP_MAX_IMAGES } from "@/lib/tip-rules";
const StripeEmbeddedPay = lazy(() => import("@/components/tip/StripeEmbeddedPay"));
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { cn } from "@/lib/utils";

type Page = NonNullable<Awaited<ReturnType<typeof getPublicTipPage>>>;

const euro = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
const groupIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{display ?? value}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`${label} kopiëren`}
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/** Publieke steunpagina: EPC-QR + tekst-IBAN, optioneel de eigen PSP-knoppen van de maker. */
export default function TipPage() {
  const params = useParams({ strict: false }) as { username?: string };
  const search = useSearch({ strict: false }) as { status?: string };
  const handle = sanitizeHandleInput(params.username);
  const load = useServerFn(getPublicTipPage);
  const start = useServerFn(startTipPayment);

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<{ clientSecret: string; publishableKey: string; returnUrl: string } | null>(null);
  const [socialImgs, setSocialImgs] = useState<string[]>([]);
  const loadSocial = useServerFn(fetchTipSocialImages);
  useEffect(() => {
    const src = page?.socialSource;
    if (!src) return setSocialImgs([]);
    if (src.mode === "picked") return setSocialImgs(src.picked);
    void loadSocial({ data: { handle: page.handle } })
      .then((r) => setSocialImgs(r.ok ? r.images.map((i) => i.url) : []))
      .catch(() => setSocialImgs([]));
  }, [page, loadSocial]);

  useEffect(() => {
    let alive = true;
    void load({ data: { handle } })
      .then((p) => {
        if (!alive) return;
        setPage(p);
        if (p) setAmount(p.presetsCents[1] ?? p.presetsCents[0] ?? p.minCents);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [handle, load]);

  const cents = useMemo(() => {
    if (custom.trim()) {
      const v = Math.round(Number(custom.replace(",", ".")) * 100);
      return Number.isFinite(v) ? v : 0;
    }
    return amount ?? 0;
  }, [custom, amount]);

  const tooLow = page ? cents < page.minCents : false;
  const reference = page ? `Steun @${page.handle}` : "";
  const epc = page && !tooLow ? buildEpcPayload({ beneficiary: page.accountName, iban: page.iban, amountCents: cents, reference }) : null;

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!page) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="max-w-sm space-y-2">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-medium">Geen steunpagina</h1>
          <p className="text-sm text-muted-foreground">
            @{handle} heeft (nog) geen actieve steunpagina. Steunpagina's zijn enkel beschikbaar voor geverifieerde makers.
          </p>
        </div>
      </main>
    );
  }

  const title = page.displayName || `@${page.handle}`;
  const photos = [...page.imageUrls, ...socialImgs.map((u) => proxied(u)).filter((u): u is string => !!u)].slice(0, TIP_MAX_IMAGES);
  const order = page.methods.filter((m) => m.enabled).map((m) => m.id);
  const pay = async (method: "card" | "bancontact" | "wero") => {
    if (tooLow) return toast.error(`Minimum is ${euro(page.minCents)}.`);
    setBusy(method);
    const res = await start({
      data: { handle: page.handle, amountCents: cents, method, origin: window.location.origin, altcha: await takeProof() },
    }).catch(() => null);
    setBusy(null);
    if (res?.ok && "embedded" in res && res.embedded) setEmbedded(res.embedded);
    else if (res?.ok && "url" in res && res.url) window.location.href = res.url;
    else toast.error(res?.message ?? "Betaling starten lukte niet.");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <UserAvatar src={page.avatarUrl} name={title} className="h-20 w-20 ring-1 ring-border" />
          <h1 className="font-display text-2xl tracking-tight">Steun {title}</h1>
          {page.message && <p className="text-sm text-muted-foreground">{page.message}</p>}
          <PrivacyBadge kind="sovereign-identity" />
        </header>

        {photos.length > 0 && (
          <div className={cn("grid gap-2", photos.length === 1 ? "grid-cols-1" : photos.length === 2 || photos.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
            {photos.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
            ))}
          </div>
        )}

        {search.status === "success" ? (
          <section className="rounded-3xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="text-lg font-medium">Bedankt voor je steun</h2>
            <p className="mt-1 text-sm text-muted-foreground">Je bijdrage ging rechtstreeks naar {title}.</p>
          </section>
        ) : (
          <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Kies een bedrag</p>
              <div className="grid grid-cols-3 gap-2">
                {page.presetsCents.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setAmount(c);
                      setCustom("");
                    }}
                    className={cn(
                      "h-11 rounded-full border text-sm font-medium transition-colors",
                      !custom && amount === c ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:border-foreground/40",
                    )}
                  >
                    {euro(c)}
                  </button>
                ))}
              </div>
              {page.allowCustom && (
                <Input inputMode="decimal" placeholder={`Ander bedrag (min. ${euro(page.minCents)})`} value={custom} onChange={(e) => setCustom(e.target.value)} className="h-11" aria-label="Ander bedrag" />
              )}
              {tooLow && <p className="text-xs text-destructive">Minimum is {euro(page.minCents)}.</p>}
            </div>

            <div className="space-y-3" style={{ order: order.indexOf("transfer") + 1 }}>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Landmark className="h-4 w-4" aria-hidden /> Scan met je bank-app
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-background p-4 ring-1 ring-border">
                {epc ? (
                  <QRCodeSVG value={epc} size={200} level="M" marginSize={0} bgColor="transparent" fgColor="currentColor" className="text-foreground" aria-label={`Betaal-QR voor ${euro(cents)}`} />
                ) : (
                  <div className="grid h-[200px] w-[200px] place-items-center text-center text-xs text-muted-foreground">Kies een geldig bedrag</div>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground">Rechtstreeks van bank naar bank, zonder transactiekosten. Werkt met elke Europese bank-app.</p>
              <div className="divide-y divide-border rounded-2xl border border-border px-4">
                <CopyRow label="Begunstigde" value={page.accountName} />
                <CopyRow label="IBAN" value={page.iban} display={groupIban(page.iban)} />
                <CopyRow label="Bedrag" value={(cents / 100).toFixed(2).replace(".", ",")} display={euro(cents)} />
                <CopyRow label="Mededeling" value={reference} />
              </div>
            </div>

            {page.externalLinks.length > 0 && (
              <div className="space-y-2 border-t border-border pt-5" style={{ order: order.indexOf("links") + 1 }}>
                <p className="text-sm font-medium">Steun via</p>
                {page.externalLinks.map((l) => (
                  <ExternalTipButton key={l.kind} kind={l.kind} value={l.value} />
                ))}
              </div>
            )}

            {page.psp && (
              <div className="space-y-3 border-t border-border pt-5" style={{ order: order.indexOf("psp") + 1 }}>
                <p className="text-sm font-medium">Betaal direct</p>
                {embedded ? (
                  <Suspense fallback={<Loader2 className="mx-auto h-5 w-5 animate-spin" />}>
                    <StripeEmbeddedPay {...embedded} label={`Betaal ${euro(cents)}`} onCancel={() => setEmbedded(null)} />
                  </Suspense>
                ) : (
                <>
                <Altcha />
                <div className="grid gap-2">
                  {page.psp.methods.includes("card") && (
                    <Button variant="outline" className="h-12 justify-start gap-3 rounded-full" disabled={!!busy || tooLow} onClick={() => void pay("card")}>
                      {busy === "card" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Kaart · {euro(cents)}
                    </Button>
                  )}
                  {page.psp.methods.includes("bancontact") && (
                    <Button variant="outline" className="h-12 justify-start gap-3 rounded-full" disabled={!!busy || tooLow} onClick={() => void pay("bancontact")}>
                      {busy === "bancontact" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">BC</span>} Bancontact · {euro(cents)}
                    </Button>
                  )}
                  {page.psp.methods.includes("wero") && (
                    <Button variant="outline" className="h-12 justify-start gap-3 rounded-full" disabled={!!busy || tooLow} onClick={() => void pay("wero")}>
                      {busy === "wero" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">W</span>} Wero en andere · {euro(cents)}
                    </Button>
                  )}
                </div>
                </>
                )}
                <p className="text-center text-[11px] text-muted-foreground">
                  Verwerkt door de eigen betaalprovider van {title}. ROUT is geen betaalverwerker en neemt geen commissie.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
