import { lazy, Suspense } from "react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, ImagePlus, KeyRound, Loader2, Lock, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
const ImageCropDialog = lazy(() => import("@/components/dashboard/ImageCropDialog").then((m) => ({ default: m.ImageCropDialog })));
import { deleteMyPspKey, getMyTipSetup, saveMyPspKey, saveMyTipSettings, uploadTipImage } from "@/lib/tip-page.functions";
import { isValidIban } from "@/lib/epc-qr";
import { TipExtrasPanel } from "@/components/dashboard/TipExtrasPanel";
import { TIP_TOUR_KEY, TipTour } from "@/components/dashboard/TipTour";
import { compressToWebp } from "@/lib/image-compress";
import { STRIPE_FULL_KEY_ERROR, TIP_MAX_IMAGES, checkStripeKey } from "@/lib/tip-rules";
import { i18n as trI18n } from "@/lib/i18n";

type Setup = Awaited<ReturnType<typeof getMyTipSetup>>;
type Settings = NonNullable<Setup["settings"]>;

const toB64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const PSP_GUIDE = {
  stripe: {
    name: "Stripe",
    steps: [
      "Log in op dashboard.stripe.com en open Ontwikkelaars → API-sleutels.",
      "Kies 'Beperkte sleutel aanmaken' en geef enkel 'Write' op PaymentIntents. Volledige secret keys (sk_…) weigeren we.",
      "Kopieer de Restricted Key (rk_live_…) én je publishable key (pk_live_…).",
    ],
    placeholder: "rk_live_…",
  },
  mollie: {
    name: "Mollie",
    steps: ["Log in op my.mollie.com.", "Ga naar Ontwikkelaars → API-sleutels.", "Kopieer de Live API-sleutel (live_…). Activeer Bancontact, kaart en eventueel Wero bij Betaalmethodes."],
    placeholder: "live_…",
  },
} as const;

/** Studio: steunpagina-instellingen. Vergrendeld zonder geverifieerde identiteit + root-handle. */
export function TipPagePanel({ onEnabledChange }: { onEnabledChange?: (enabled: boolean) => void }) {
  const load = useServerFn(getMyTipSetup);
  const save = useServerFn(saveMyTipSettings);
  const upload = useServerFn(uploadTipImage);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [presetText, setPresetText] = useState("5, 10, 25");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tour, setTour] = useState(false);

  const refresh = () =>
    load()
      .then((d) => {
        setSetup(d);
        if (d.settings) {
          onEnabledChange?.(d.settings.enabled);
          setS(d.settings);
          setPresetText(d.settings.presetsCents.map((c) => String(c / 100).replace(".", ",")).join(", "));
        }
      })
      .catch(() => setSetup(null));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!setup) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  if (!setup.eligibility.ok || !s) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Lock className="h-4 w-4" aria-hidden /> Vergrendeld
        </p>
        <p className="mt-2 text-muted-foreground">
          Geldfuncties vereisen een geverifieerde identiteit en een eigen naam op rout.be/naam. Dat beschermt supporters tegen fraude en
          is nodig voor compliance. Gratis aliassen (rout.be/u/…) kunnen geen steunpagina maken.
        </p>
        {/* Already verified but no own name yet: the next step is the name, not verifying again. */}
        <Button asChild size="sm" className="mt-3">
          {setup.eligibility.reason === "no_root_handle" ? <a href="/studio">Kies je eigen naam</a> : <a href="/verify">Identiteit verifiëren</a>}
        </Button>
      </div>
    );
  }

  const handle = setup.eligibility.handle;
  if (!handle) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));
  const ibanOk = !s.iban || isValidIban(s.iban.replace(/\s+/g, ""));
  const nameHint = setup.eligibility.isBusiness && setup.eligibility.businessName
    ? `${setup.eligibility.legalName ?? ""} of ${setup.eligibility.businessName}`
    : (setup.eligibility.legalName ?? "");

  const onSave = async () => {
    const presets = presetText
      .split(/[;\s]+|,(?=\s)/)
      .map((t) => Math.round(Number(t.replace(",", ".")) * 100))
      .filter((n) => Number.isFinite(n) && n > 0);
    setBusy(true);
    const res = await save({ data: { ...s, presetsCents: presets } }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onEnabledChange?.(s.enabled);
      toast.success(trI18n.t("ui.142c55609f"));
      void refresh();
    } else toast.error(res && !res.ok ? res.message : "Opslaan mislukt");
  };

  return (
    <div className="space-y-6">
      {tour && <TipTour onDone={() => setTour(false)} />}
      <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setTour(true)}>
        Rondleiding opnieuw bekijken
      </button>
      <div data-tour="tip-status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
        <code className="text-xs">rout.be/{handle}/tip</code>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={`/${handle}/tip`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Bekijk
            </a>
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={s.enabled}
              onCheckedChange={(v) => {
                set("enabled", v);
                let seen = false;
                try {
                  seen = window.localStorage.getItem(TIP_TOUR_KEY) === "1";
                } catch {
                  /* geen opslag */
                }
                if (v && !seen) setTour(true);
              }}
            />{" "}
            Actief
          </label>
        </div>
      </div>

      <section data-tour="tip-bank" className="space-y-3">
        <h4 className="text-sm font-medium">Bankrekening (SEPA / EPC-QR)</h4>
        <p className="text-xs text-muted-foreground">
          Bezoekers scannen een QR-code met hun eigen bank-app. Geld gaat rechtstreeks naar je rekening — geen API, geen kosten, ROUT raakt het geld niet aan.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tip-iban">IBAN</Label>
            <Input id="tip-iban" value={s.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} placeholder="BE68 5390 0754 7034" aria-invalid={!ibanOk} />
            {!ibanOk && <p className="mt-1 text-xs text-destructive">Ongeldig IBAN</p>}
          </div>
          <div>
            <Label htmlFor="tip-name">Rekeninghouder</Label>
            <Input id="tip-name" value={s.accountName} onChange={(e) => set("accountName", e.target.value)} placeholder={nameHint} />
            <p className="mt-1 text-[11px] text-muted-foreground">Moet overeenkomen met je geverifieerde naam{nameHint ? `: ${nameHint}` : ""}.</p>
          </div>
        </div>
      </section>

      <section data-tour="tip-amounts" className="space-y-3">
        <h4 className="text-sm font-medium">Bedragen</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tip-presets">Vaste bedragen (€)</Label>
            <Input id="tip-presets" value={presetText} onChange={(e) => setPresetText(e.target.value)} placeholder="5, 10, 25" />
          </div>
          <div>
            <Label htmlFor="tip-min">Minimumbedrag (€)</Label>
            <Input id="tip-min" inputMode="decimal" value={String(s.minCents / 100).replace(".", ",")} onChange={(e) => set("minCents", Math.max(100, Math.round(Number(e.target.value.replace(",", ".")) * 100) || 100))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={s.allowCustom} onCheckedChange={(v) => set("allowCustom", v)} /> Bezoekers mogen een eigen bedrag invullen
        </label>
        <div>
          <Label htmlFor="tip-msg">Boodschap</Label>
          <Textarea id="tip-msg" rows={2} maxLength={400} value={s.message} onChange={(e) => set("message", e.target.value)} placeholder="Bedankt dat je mijn werk steunt!" />
        </div>
      </section>

      <section data-tour="tip-photos" className="space-y-3">
        <h4 className="text-sm font-medium">Foto's ({s.imageUrls.length}/{TIP_MAX_IMAGES})</h4>
        <div className="grid grid-cols-3 gap-2">
          {s.imageUrls.map((u) => (
            <div key={u} className="relative">
              <img src={u} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
              <button type="button" aria-label="Verwijder afbeelding" onClick={() => set("imageUrls", s.imageUrls.filter((x) => x !== u))} className="absolute right-1 top-1 rounded-full bg-background/90 p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {s.imageUrls.length < TIP_MAX_IMAGES && (
            <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:border-foreground/40">
              <ImagePlus className="h-5 w-5" aria-hidden />
              <span className="sr-only">Afbeelding toevoegen</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setCropSrc(URL.createObjectURL(f));
                }}
              />
            </label>
          )}
        </div>
        {cropSrc && (<Suspense fallback={null}><ImageCropDialog
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={async (blob) => {
            setCropSrc(null);
            // Automatisch verkleind (max 2000 px, WebP) — zichtbaar even scherp, veel kleiner.
            const small = await compressToWebp(blob).catch(() => blob);
            const res = await upload({ data: { base64: await toB64(small) } }).catch(() => null);
            if (res?.ok) set("imageUrls", [...s.imageUrls, res.url].slice(0, TIP_MAX_IMAGES));
            else toast.error(res && !res.ok ? res.message : "Upload mislukt");
          }}
        /></Suspense>)}
      </section>

      <div className="flex flex-wrap gap-1.5">
        {s.imageUrls.length > 1 &&
          s.imageUrls.map((u, i) =>
            i > 0 ? (
              <button key={u} type="button" className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground" onClick={() => {
                const next = [...s.imageUrls];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                set("imageUrls", next);
              }}>
                Foto {i + 1} naar voren
              </button>
            ) : null,
          )}
      </div>

      <TipExtrasPanel settings={s} onChange={(patch) => setS((p) => (p ? { ...p, ...patch } : p))} />

      <Button data-tour="tip-save" onClick={() => void onSave()} disabled={busy || !ibanOk}>
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Opslaan
      </Button>

      {setup.eligibility.isBusiness ? (
        <PspPanel psp={setup.psp} isBusiness onChanged={refresh} />
      ) : (
        <section className="flex items-start gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong className="text-foreground">Betaalproviders (PSP)</strong> zijn alleen beschikbaar met een goedgekeurde
            Bedrijfsbadge. Je steunpagina werkt altijd met de gratis betaal-QR en IBAN.
          </p>
        </section>
      )}
    </div>
  );
}

function PspPanel({ psp, isBusiness, onChanged }: { psp: Setup["psp"]; isBusiness: boolean; onChanged: () => void }) {
  const saveKey = useServerFn(saveMyPspKey);
  const del = useServerFn(deleteMyPspKey);
  const [provider, setProvider] = useState<"stripe" | "mollie">("mollie");
  const [secret, setSecret] = useState("");
  const [pk, setPk] = useState("");
  const stripeError = provider === "stripe" && secret.trim().length > 6 ? (/^sk_/.test(secret.trim()) ? STRIPE_FULL_KEY_ERROR : checkStripeKey(secret).ok ? null : null) : null;
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const guide = PSP_GUIDE[provider];

  return (
    <section className="space-y-4 rounded-2xl border border-border p-4">
      <header className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" aria-hidden />
        <h4 className="text-sm font-medium">Betaalproviders (PSP) — optioneel</h4>
        {isBusiness && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">Bedrijf</span>}
      </header>
      <p className="rounded-xl bg-muted p-3 text-xs">
        <strong>ROUT is geen betaalverwerker en neemt geen commissie. Je gebruikt je eigen PSP-contract; ROUT levert enkel de visuele knop.</strong>
      </p>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Wero en Bancontact via een PSP vereisen een geregistreerd bedrijf (KBO/KvK) en een goedgekeurd account bij die provider. De QR-code blijft altijd bovenaan staan.
      </p>

      {psp.length > 0 && (
        <ul className="space-y-2">
          {psp.map((p) => (
            <li key={p.provider} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
              <span>
                {PSP_GUIDE[p.provider].name} · •••• {p.last4} {p.mode === "test" && <span className="text-xs text-muted-foreground">(test)</span>}
              </span>
              <Button size="sm" variant="ghost" aria-label={`${PSP_GUIDE[p.provider].name} ontkoppelen`} onClick={async () => { await del({ data: { provider: p.provider } }); onChanged(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="inline-flex rounded-full border border-border p-0.5">
        {(["mollie", "stripe"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setProvider(id)} className={`rounded-full px-3 py-1 text-xs ${provider === id ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            {PSP_GUIDE[id].name}
          </button>
        ))}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        {guide.steps.map((st) => <li key={st}>{st}</li>)}
      </ol>
      <div>
        <Label htmlFor="psp-secret">Geheime sleutel</Label>
        <Input id="psp-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={guide.placeholder} />
        {stripeError && <p role="alert" className="mt-1 text-xs text-destructive">{stripeError}</p>}
        {provider === "stripe" && (
          <div className="mt-2">
            <Label htmlFor="psp-pk">Publishable key</Label>
            <Input id="psp-pk" autoComplete="off" value={pk} onChange={(e) => setPk(e.target.value)} placeholder="pk_live_…" />
          </div>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">Wordt gecontroleerd bij {guide.name} en daarna versleuteld bewaard. Je ziet hem nooit meer terug, enkel de laatste 4 tekens.</p>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" />
        Ik begrijp dat betalingen via mijn eigen PSP-contract lopen en dat ROUT geen betaalverwerker is.
      </label>
      <Button
        size="sm"
        disabled={!accept || secret.trim().length < 10 || busy || !!stripeError || (provider === "stripe" && !checkStripeKey(secret).ok)}
        onClick={async () => {
          setBusy(true);
          const res = await saveKey({ data: { provider, secret, publishableKey: provider === "stripe" ? pk : undefined, acceptDisclaimer: true } }).catch(() => null);
          setBusy(false);
          if (res?.ok) {
            toast.success(`${guide.name} gekoppeld`);
            setSecret("");
            setPk("");
            onChanged();
          } else toast.error(res && !res.ok ? res.message : "Koppelen mislukt");
        }}
      >
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {guide.name} koppelen
      </Button>
    </section>
  );
}
