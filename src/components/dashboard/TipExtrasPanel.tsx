import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { previewTipSocialImages } from "@/lib/tip-page.functions";
import { proxied } from "@/lib/image-proxy-rules";
import {
  EXTERNAL_TIP_CATALOG,
  TIP_MAX_IMAGES,
  cleanExternalValue,
  normalizeTipMethods,
  type ExternalTipKind,
  type ExternalTipLink,
  type TipMethod,
  type TipSocialSource,
} from "@/lib/tip-rules";
import { i18n as trI18n } from "@/lib/i18n";

type Extras = { methods: TipMethod[]; externalLinks: ExternalTipLink[]; socialSource: TipSocialSource };

const METHOD_LABEL: Record<TipMethod["id"], string> = {
  transfer: "Overschrijving / betaal-QR",
  psp: "Direct betalen (Stripe of Mollie)",
  links: "Externe links (Buy Me a Coffee, bunq.me, …)",
};

/** Inhoud van de steunpagina: methodes + volgorde, externe links en foto's van Bluesky/Mastodon. */
export function TipExtrasPanel({ settings, onChange }: { settings: Extras; onChange: (patch: Partial<Extras>) => void }) {
  const methods = normalizeTipMethods(settings.methods);
  const move = (i: number, d: -1 | 1) => {
    const next = [...methods];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ methods: next });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2" data-tour="tip-methods">
        <h4 className="text-sm font-medium">Betaalmethodes en volgorde</h4>
        <ul className="space-y-1.5">
          {methods.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <Switch
                checked={m.enabled}
                disabled={m.id === "transfer"}
                onCheckedChange={(v) => onChange({ methods: methods.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)) })}
                aria-label={METHOD_LABEL[m.id]}
              />
              <span className="flex-1">{METHOD_LABEL[m.id]}</span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Omhoog" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Omlaag" onClick={() => move(i, 1)} disabled={i === methods.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">De betaal-QR blijft altijd beschikbaar: gratis en zonder tussenpartij.</p>
      </section>

      <ExternalLinksEditor links={settings.externalLinks} onChange={(externalLinks) => onChange({ externalLinks })} />
      <SocialPhotosEditor source={settings.socialSource} onChange={(socialSource) => onChange({ socialSource })} />
    </div>
  );
}

function ExternalLinksEditor({ links, onChange }: { links: ExternalTipLink[]; onChange: (l: ExternalTipLink[]) => void }) {
  const [kind, setKind] = useState<ExternalTipKind>("buymeacoffee");
  const [value, setValue] = useState("");
  const free = (Object.keys(EXTERNAL_TIP_CATALOG) as ExternalTipKind[]).filter((k) => !links.some((l) => l.kind === k));
  const add = () => {
    const clean = cleanExternalValue(kind, value);
    if (!clean) return toast.error(trI18n.t("ui.5e927b0167"));
    onChange([...links, { kind, value: clean }]);
    setValue("");
    const nextFree = free.find((k) => k !== kind);
    if (nextFree) setKind(nextFree);
  };
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium">Externe steunlinks</h4>
      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li key={l.kind} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
              <span>
                {EXTERNAL_TIP_CATALOG[l.kind].label} · <span className="text-muted-foreground">{l.value}</span>
              </span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`${EXTERNAL_TIP_CATALOG[l.kind].label} verwijderen`} onClick={() => onChange(links.filter((x) => x.kind !== l.kind))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select
            value={free.includes(kind) ? kind : free[0]}
            onChange={(e) => setKind(e.target.value as ExternalTipKind)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Dienst"
          >
            {free.map((k) => (
              <option key={k} value={k}>
                {EXTERNAL_TIP_CATALOG[k].label}
              </option>
            ))}
          </select>
          <Input className="min-w-0 flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder={EXTERNAL_TIP_CATALOG[free.includes(kind) ? kind : free[0]!].placeholder} />
          <Button type="button" variant="outline" onClick={add} className="gap-1">
            <Plus className="h-4 w-4" /> Toevoegen
          </Button>
        </div>
      )}
    </section>
  );
}

function SocialPhotosEditor({ source, onChange }: { source: TipSocialSource; onChange: (s: TipSocialSource) => void }) {
  const fetchImages = useServerFn(previewTipSocialImages);
  const [network, setNetwork] = useState<"bluesky" | "mastodon">(source?.network ?? "bluesky");
  const [handle, setHandle] = useState(source?.handle ?? "");
  const [images, setImages] = useState<{ url: string; alt: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = source?.mode ?? "latest";
  const picked = source?.picked ?? [];

  const load = async () => {
    setBusy(true);
    const res = await fetchImages({ data: { network, handle } }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(res && !res.ok ? res.message : "Ophalen mislukt");
    setImages(res.images);
    onChange({ network, handle: handle.replace(/^@/, ""), mode, picked });
    if (res.images.length === 0) toast.message(trI18n.t("ui.bab879099a"));
  };

  return (
    <section className="space-y-2" data-tour="tip-photos">
      <h4 className="text-sm font-medium">Foto's van Bluesky of Mastodon</h4>
      <p className="text-xs text-muted-foreground">Enkel je gebruikersnaam. We tonen alleen openbare berichten, via onze privacyproxy.</p>
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-full border border-border p-0.5">
          {(["bluesky", "mastodon"] as const).map((n) => (
            <button key={n} type="button" onClick={() => setNetwork(n)} className={`rounded-full px-3 py-1 text-xs ${network === n ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {n === "bluesky" ? "Bluesky" : "Mastodon"}
            </button>
          ))}
        </div>
        <Input className="min-w-0 flex-1" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={network === "bluesky" ? "naam.bsky.social" : "@naam@mastodon.social"} />
        <Button type="button" variant="outline" onClick={() => void load()} disabled={busy || handle.trim().length < 3}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Ophalen
        </Button>
        {source && (
          <Button type="button" variant="ghost" onClick={() => { onChange(null); setImages(null); }}>
            Loskoppelen
          </Button>
        )}
      </div>
      {source && (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => onChange({ ...source, mode: "latest" })} className={`rounded-full border px-3 py-1 ${mode === "latest" ? "border-primary bg-primary/10" : "border-border"}`}>
            Toon altijd mijn nieuwste
          </button>
          <button type="button" onClick={() => onChange({ ...source, mode: "picked" })} className={`rounded-full border px-3 py-1 ${mode === "picked" ? "border-primary bg-primary/10" : "border-border"}`}>
            Enkel deze kiezen ({picked.length}/{TIP_MAX_IMAGES})
          </button>
        </div>
      )}
      {source && images && images.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {images.map((img) => {
            const on = picked.includes(img.url);
            const src = proxied(img.url);
            if (!src) return null;
            return (
              <button
                key={img.url}
                type="button"
                disabled={mode !== "picked"}
                aria-pressed={on}
                onClick={() => {
                  const next = on ? picked.filter((u) => u !== img.url) : [...picked, img.url].slice(0, TIP_MAX_IMAGES);
                  onChange({ ...source, picked: next });
                }}
                className={`relative overflow-hidden rounded-lg ring-2 ${on && mode === "picked" ? "ring-primary" : "ring-transparent"} disabled:opacity-80`}
              >
                <img src={src} alt={img.alt} loading="lazy" className="aspect-square w-full object-cover" />
                {on && mode === "picked" && (
                  <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
