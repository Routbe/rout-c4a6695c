import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { normalizeBadgeWebsite, suggestBadgeAccent } from "@/lib/badge-editor-rules";
import { BadgeClaimLinks } from "@/components/admin/BadgeClaimLinks";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { BadgeEmblem } from "@/components/profile/BadgeEmblem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminCreateCustomBadge,
  adminDeleteCustomBadge,
  adminFindUsers,
  adminListBadgeHolders,
  adminListCustomBadges,
  adminSetCustomBadge,
  adminUpdateCustomBadge,
  adminUploadBadgeImage,
  adminUserCustomBadges,
} from "@/lib/custom-badges.functions";
import { i18n as trI18n } from "@/lib/i18n";

type Badge = Awaited<ReturnType<typeof adminListCustomBadges>>[number];
type Holder = Awaited<ReturnType<typeof adminListBadgeHolders>>[number];
type Found = Awaited<ReturnType<typeof adminFindUsers>>[number];

export const fileToBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export { BadgeEmblem };

/** Zoekveld op handle: geeft één gekozen gebruiker terug. */
function UserSearch({ onPick, placeholder = "Zoek op @handle of naam" }: { onPick: (u: Found) => void; placeholder?: string }) {
  const find = useServerFn(adminFindUsers);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  useEffect(() => {
    if (q.replace(/^@/, "").trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void find({ data: { query: q } }).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, find]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" aria-label="Gebruiker zoeken" />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.map((u) => (
            <li key={u.userId}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(u);
                  setQ("");
                  setResults([]);
                }}
              >
                <span className="font-medium">@{u.username ?? "—"}</span>
                <span className="truncate pl-3 text-xs text-muted-foreground">{u.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABELS: Record<Badge["kind"], string> = {
  crest: "Wapenschild",
  emblem: "Embleem",
  award: "Onderscheiding",
  partner: "Partner",
};

type Draft = Pick<Badge, "name" | "description" | "imageUrl" | "kind" | "motto" | "story" | "issuerName" | "issuerUrl" | "accentColor">;
const emptyDraft: Draft = { name: "", description: null, imageUrl: null, kind: "crest", motto: null, story: null, issuerName: null, issuerUrl: null, accentColor: null };

/** Formulier voor nieuw of bestaand wapenschild/badge, met uploader. */
function BadgeForm({ initial, onSaved, onCancel }: { initial?: Badge; onSaved: () => void; onCancel?: () => void }) {
  const create = useServerFn(adminCreateCustomBadge);
  const update = useServerFn(adminUpdateCustomBadge);
  const upload = useServerFn(adminUploadBadgeImage);
  const [d, setD] = useState<Draft>(initial ?? emptyDraft);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const txt = (v: string) => (v.trim() ? v : null);

  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (initial) await update({ data: { id: initial.id, ...d } });
          else await create({ data: d });
          toast.success(initial ? "Badge bijgewerkt" : "Badge aangemaakt");
          if (!initial) setD(emptyDraft);
          onSaved();
        } catch {
          toast.error(trI18n.t("ui.450fac1b34"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-medium">{initial ? "Badge bewerken" : "Nieuwe badge of wapenschild"}</h2>
      <div className="flex flex-col gap-5 sm:flex-row">
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 hover:border-foreground/40"
          onDragOver={(e) => e.preventDefault()}
        >
          <BadgeEmblem badge={{ name: d.name || "Badge", imageUrl: d.imageUrl, kind: d.kind, accentColor: d.accentColor }} size={96} />
          <span className="text-xs text-muted-foreground">{uploading ? "Uploaden…" : d.imageUrl ? "Andere afbeelding" : "Afbeelding kiezen"}</span>
          <span className="text-[10px] text-muted-foreground">PNG, SVG, JPG of WebP · max 2 MB</span>
          <input
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000) return toast.error(trI18n.t("ui.a77905c686"));
              setUploading(true);
              const res = await upload({ data: { base64: await fileToBase64(file) } }).catch(() => null);
              setUploading(false);
              if (res?.ok) {
                const accent = await suggestBadgeAccent(file).catch(() => null);
                setD(current => ({ ...current, imageUrl: res.url, accentColor: accent ?? current.accentColor }));
              }
              else toast.error(res && !res.ok ? res.message : "Upload mislukt");
            }}
          />
          {d.imageUrl && (
            <button type="button" className="text-[11px] text-destructive underline" onClick={(e) => { e.preventDefault(); set("imageUrl", null); }}>
              Verwijderen
            </button>
          )}
        </label>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cb-name">Naam</Label>
            <Input id="cb-name" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Familie Van Damme" required minLength={2} maxLength={60} />
          </div>
          <div>
            <Label htmlFor="cb-kind">Soort</Label>
            <select id="cb-kind" value={d.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {(Object.keys(KIND_LABELS) as Draft["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cb-color">Accentkleur</Label>
            <div className="flex gap-2">
              <input id="cb-color" type="color" value={d.accentColor ?? "#b08d3c"} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-12 rounded-md border border-input bg-background" />
              {d.accentColor && <Button type="button" variant="ghost" size="sm" onClick={() => set("accentColor", null)}>Standaard</Button>}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cb-motto">Motto / devies</Label>
            <Input id="cb-motto" value={d.motto ?? ""} onChange={(e) => set("motto", txt(e.target.value))} maxLength={80} placeholder="Fortis et fidelis" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cb-desc">Korte omschrijving</Label>
            <Input id="cb-desc" value={d.description ?? ""} onChange={(e) => set("description", txt(e.target.value))} maxLength={200} placeholder="Familiewapen sinds 1832" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cb-story">Verhaal (zichtbaar in de pop-up)</Label>
            <Textarea id="cb-story" value={d.story ?? ""} onChange={(e) => set("story", txt(e.target.value))} maxLength={1000} rows={3} />
          </div>
          <div>
            <Label htmlFor="cb-issuer">Uitgegeven door</Label>
            <Input id="cb-issuer" value={d.issuerName ?? ""} onChange={(e) => set("issuerName", txt(e.target.value))} maxLength={80} placeholder="ROUT" />
          </div>
          <div>
            <Label htmlFor="cb-url">Website</Label>
            <Input id="cb-url" value={d.issuerUrl ?? ""} onChange={(e) => set("issuerUrl", txt(e.target.value))} onBlur={() => { try { set("issuerUrl", normalizeBadgeWebsite(d.issuerUrl)); } catch { toast.error(trI18n.t("ui.28951ba435")); } }} maxLength={300} placeholder="familie.be" />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || uploading || d.name.trim().length < 2}>
          {initial ? <Save className="mr-1.5 h-4 w-4" aria-hidden /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden />}
          {initial ? "Opslaan" : "Badge aanmaken"}
        </Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Annuleren</Button>}
      </div>
    </form>
  );
}

function BadgeDetail({ badge, onBack, onChanged }: { badge: Badge; onBack: () => void; onChanged: () => void }) {
  const listHolders = useServerFn(adminListBadgeHolders);
  const setBadge = useServerFn(adminSetCustomBadge);
  const remove = useServerFn(adminDeleteCustomBadge);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = useCallback(() => {
    void listHolders({ data: { badgeId: badge.id } }).then(setHolders).catch(() => toast.error(trI18n.t("ui.8f35a7159c")));
  }, [badge.id, listHolders]);
  useEffect(refresh, [refresh]);

  const toggle = async (userId: string, granted: boolean) => {
    try {
      await setBadge({ data: { userId, badgeId: badge.id, granted, reason: granted && reason.trim() ? reason.trim() : null } });
      if (granted) setReason("");
      toast.success(granted ? "Badge toegekend" : "Badge ingetrokken");
      refresh();
      onChanged();
    } catch {
      toast.error(trI18n.t("ui.62beee8b58"));
    }
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Alle badges
      </button>
      <header className="flex items-center gap-4">
        <BadgeEmblem badge={badge} size={72} />
        <div className="flex-1">
          <h2 className="font-display text-2xl">{badge.name}</h2>
          {badge.motto && <p className="text-sm italic">“{badge.motto}”</p>}
          {badge.description && <p className="text-sm text-muted-foreground">{badge.description}</p>}
        </div>
        <Button variant="outline" onClick={() => setEditing((v) => !v)}>
          <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Bewerken
        </Button>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={async () => {
            if (!window.confirm(`"${badge.name}" definitief verwijderen bij alle houders?`)) return;
            await remove({ data: { id: badge.id } });
            onChanged();
            onBack();
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Verwijderen
        </Button>
      </header>

      {editing && <BadgeForm initial={badge} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />}

      <section className="space-y-2">
        <Label>Toekennen aan</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reden (optioneel, zichtbaar in de pop-up) — bv. Stamhouder sinds 2024" aria-label="Reden van toekenning" />
        <UserSearch onPick={(u) => void toggle(u.userId, true)} />
      </section>

      <BadgeClaimLinks badgeId={badge.id} />

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Houders · {holders.length}</p>
        {holders.length === 0 && <p className="text-sm text-muted-foreground">Nog niemand heeft deze badge.</p>}
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {holders.map((h) => (
            <li key={h.userId} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">@{h.username ?? h.userId.slice(0, 8)}</span>
                {h.displayName && <span className="pl-2 text-muted-foreground">{h.displayName}</span>}
                {h.reason && <span className="block text-xs text-muted-foreground">{h.reason}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void toggle(h.userId, false)} aria-label={`Intrekken bij ${h.username}`}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** /admin/custom-badges — centraal beheer van familiewapens en bedrijfsemblemen. */
export default function AdminCustomBadges() {
  const list = useServerFn(adminListCustomBadges);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void list().then(setBadges).catch(() => toast.error(trI18n.t("ui.a05109c1b6")));
  }, [list]);
  useEffect(refresh, [refresh]);
  const current = badges.find((b) => b.id === selected) ?? null;

  return (
    <AppLayout title="Wapenschilden & badges" crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Wapenschilden & badges" }]}>
    <div className="w-full space-y-8">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Eigen badges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Familiewapens en bedrijfsemblemen. Ze verschijnen naast het blauwe vinkje of privacyschild, nooit in de plaats ervan.
        </p>
      </header>
      {current ? (
        <BadgeDetail badge={current} onBack={() => setSelected(null)} onChanged={refresh} />
      ) : (
        <>
          <BadgeForm onSaved={refresh} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b.id)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/40"
              >
                <BadgeEmblem badge={b} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.name}</span>
                  <span className="block text-xs text-muted-foreground">{b.holders} houder{b.holders === 1 ? "" : "s"}</span>
                </span>
              </button>
            ))}
            {badges.length === 0 && <p className="text-sm text-muted-foreground">Nog geen eigen badges.</p>}
          </div>
        </>
      )}
    </div>
    </AppLayout>
  );
}

/** Blok in het gebruikersbeheer: één gebruiker kiezen en zijn eigen badges aan/uit zetten. */
export function UserCustomBadgesCard() {
  const list = useServerFn(adminListCustomBadges);
  const ofUser = useServerFn(adminUserCustomBadges);
  const setBadge = useServerFn(adminSetCustomBadge);
  const [all, setAll] = useState<Badge[]>([]);
  const [user, setUser] = useState<Found | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());

  useEffect(() => {
    void list().then(setAll).catch(() => setAll([]));
  }, [list]);
  useEffect(() => {
    if (!user) return;
    void ofUser({ data: { userId: user.userId } }).then((b) => setOwned(new Set(b.map((x) => x.id))));
  }, [user, ofUser]);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Eigen badges per gebruiker</h2>
        <Link to="/admin/custom-badges" className="text-sm underline">Alle eigen badges beheren</Link>
      </div>
      <UserSearch onPick={setUser} />
      {user && (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">@{user.username}</span> — vink aan om toe te kennen. Het vinkje of schild blijft altijd behouden.
          </p>
          {all.length === 0 && <p className="text-sm text-muted-foreground">Maak eerst een badge aan.</p>}
          <div className="flex flex-wrap gap-2">
            {all.map((b) => {
              const on = owned.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={on}
                  onClick={async () => {
                    await setBadge({ data: { userId: user.userId, badgeId: b.id, granted: !on } });
                    setOwned((s) => {
                      const n = new Set(s);
                      if (on) n.delete(b.id);
                      else n.add(b.id);
                      return n;
                    });
                  }}
                  className={`flex items-center gap-2 rounded-full border px-2 py-1 text-sm ${on ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <BadgeEmblem badge={b} size={22} /> {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
