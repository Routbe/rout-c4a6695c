import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Sparkles, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminApproveWithWhitelist,
  adminFindAccount,
  adminListBusinessRequests,
  adminListInfluencerRequests,
  adminReviewBusinessRequest,
  adminReviewInfluencerRequest,
} from "@/lib/verification-requests.functions";
import { VerifyUserDialog } from "@/components/admin/VerifyUserDialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { i18n as trI18n } from "@/lib/i18n";

const FOLDERS = [
  { id: "pending", label: "Ingediend" },
  { id: "awaiting_payment", label: "Bezig" },
  { id: "approved", label: "Gelukt" },
  { id: "rejected", label: "Mislukt" },
] as const;
type Folder = (typeof FOLDERS)[number]["id"];

/**
 * Super Admin inbox: pending influencer- en bedrijfsaanvragen met een
 * volledig ingevulde detailweergave, naam-whitelist en een persoonspaneel.
 */

type Row = Record<string, unknown>;
type Item = { kind: "influencer" | "business"; row: Row };

const text = (row: Row, key: string) => (row[key] == null ? "" : String(row[key]));

function proposedNames(item: Item): string[] {
  if (item.kind === "influencer") return ((item.row["handle_choices"] as string[] | null) ?? []).filter(Boolean);
  return [text(item.row, "website_domain"), text(item.row, "company_name").toLowerCase().replace(/[^a-z0-9.]/g, "")].filter(Boolean);
}

function fieldsOf(item: Item): [string, string][] {
  const r = item.row;
  if (item.kind === "business") {
    return [
      ["Officiële bedrijfsnaam", text(r, "company_name")],
      ["Rechtsvorm", text(r, "legal_form")],
      ["Btw-nummer", text(r, "vat_number")],
      ["Maatschappelijke zetel", text(r, "address")],
      ["Domeinnaam", text(r, "website_domain")],
      ["Contactpersoon", text(r, "contact_name")],
      ["Contact e-mail", text(r, "contact_email")],
    ];
  }
  const links = r["social_links"];
  return [
    ["Account", `@${text(r, "username")}`],
    ["Sociale links", Array.isArray(links) ? (links as string[]).join("\n") : text(r, "social_links")],
    ["Toelichting", text(r, "motivation")],
    ["Al geverifieerd", r["verified"] ? "Ja (gratis)" : "Nee (€ 70)"],
  ];
}

export default function AdminVerificationRequests() {
  const listBusiness = useServerFn(adminListBusinessRequests);
  const listInfluencer = useServerFn(adminListInfluencerRequests);
  const reviewBusiness = useServerFn(adminReviewBusinessRequest);
  const reviewInfluencer = useServerFn(adminReviewInfluencerRequest);
  const approve = useServerFn(adminApproveWithWhitelist);

  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("request"),
  );
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<Folder>("pending");

  const refresh = useCallback(async () => {
    try {
      const [b, i] = await Promise.all([listBusiness({ data: { status: folder } }), listInfluencer({ data: { status: folder } })]);
      setItems([
        ...(i as Row[]).map((row) => ({ kind: "influencer" as const, row })),
        ...(b as Row[]).map((row) => ({ kind: "business" as const, row })),
      ].sort((a, z) => text(z.row, "created_at").localeCompare(text(a.row, "created_at"))));
    } catch {
      toast.error(trI18n.t("ui.d964a2a930"));
    }
  }, [listBusiness, listInfluencer, folder]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(() => items.find((it) => text(it.row, "id") === selectedId) ?? null, [items, selectedId]);

  return (
    <AppLayout title="Verificaties & aanvragen" crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Verificaties" }]} width="wide">
    <div className="space-y-8">
      <div role="tablist" aria-label="Mappen" className="flex flex-wrap gap-2">
        {FOLDERS.map((f) => (
          <Button key={f.id} role="tab" aria-selected={folder === f.id} size="sm" variant={folder === f.id ? "default" : "outline"}
            onClick={() => { setFolder(f.id); setSelectedId(null); }}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{FOLDERS.find((f) => f.id === folder)?.label} · {items.length}</p>
          {items.length === 0 && <p className="text-sm text-muted-foreground">Niets in deze map.</p>}
          {items.map((it) => {
            const id = text(it.row, "id");
            const Icon = it.kind === "business" ? Building2 : Sparkles;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedId(id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${selectedId === id ? "border-foreground bg-muted" : "border-border hover:border-foreground/40"}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {it.kind === "business" ? text(it.row, "company_name") : `@${text(it.row, "username") || "onbekend"}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {it.kind === "business" ? "Bedrijf" : "Influencer"} · {text(it.row, "created_at").slice(0, 10)}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        <section className="rounded-2xl border border-border bg-card p-6">
          {selected && folder !== "pending" ? (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">{selected.kind === "business" ? "Bedrijfsverificatie" : "Influencerverificatie"}</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                {fieldsOf(selected).map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap text-sm">{value || "—"}</dd></div>
                ))}
                {text(selected.row, "admin_note") && (
                  <div><dt className="text-xs text-muted-foreground">Notitie</dt><dd className="text-sm">{text(selected.row, "admin_note")}</dd></div>
                )}
              </dl>
            </div>
          ) : selected ? (
            <RequestDetail
              key={text(selected.row, "id")}
              item={selected}
              busy={busy}
              onApprove={async (handles) => {
                setBusy(true);
                try {
                  const res = await approve({ data: { kind: selected.kind, requestId: text(selected.row, "id"), handles } });
                  if (!res.ok) toast.error(res.reason);
                  else { toast.success(`Goedgekeurd: ${res.approved.join(", ")}`); setSelectedId(null); await refresh(); }
                } catch { toast.error(trI18n.t("ui.318ec21b17")); } finally { setBusy(false); }
              }}
              onReject={async (note) => {
                setBusy(true);
                try {
                  const data = { requestId: text(selected.row, "id"), approve: false, note: note || null };
                  await (selected.kind === "business" ? reviewBusiness({ data }) : reviewInfluencer({ data }));
                  toast.success(trI18n.t("ui.911a1fe853")); setSelectedId(null); await refresh();
                } catch { toast.error(trI18n.t("ui.7bf4a45792")); } finally { setBusy(false); }
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Kies een aanvraag in de inbox.</p>
          )}
        </section>
      </div>

      <PersonPanel />
    </div>
    </AppLayout>
  );
}

function RequestDetail({
  item, busy, onApprove, onReject,
}: { item: Item; busy: boolean; onApprove: (h: string[]) => void; onReject: (note: string) => void }) {
  const names = proposedNames(item);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const chosen = [...names.filter((n) => picked[n]), ...(item.kind === "business" && extra.trim() ? [extra.trim()] : [])];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">{item.kind === "business" ? "Bedrijfsverificatie" : "Influencerverificatie"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {fieldsOf(item).map(([label, value]) => (
          <div key={label} className="space-y-1.5">
            <Label>{label}</Label>
            {value.includes("\n") || value.length > 60
              ? <Textarea readOnly value={value} rows={3} />
              : <Input readOnly value={value} />}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Voorgestelde namen</p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {names.map((n, i) => (
            <li key={n} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
              <code className="flex-1 text-sm">rout.be/{n}</code>
              <span className="text-xs text-muted-foreground">{picked[n] ? "Goedgekeurd" : "Niet gekozen"}</span>
              <Switch aria-label={`Keur ${n} goed`} checked={Boolean(picked[n])} onCheckedChange={(on) => setPicked({ ...picked, [n]: on })} />
            </li>
          ))}
        </ul>
        {item.kind === "business" && (
          <Input className="mt-3" placeholder="Extra merknaam (optioneel)" value={extra} onChange={(e) => setExtra(e.target.value)} />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-5">
        <Button disabled={busy || chosen.length === 0} onClick={() => onApprove(chosen)}>
          Goedkeuren ({chosen.length})
        </Button>
        <Input className="max-w-xs" placeholder="Reden van afwijzing (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="outline" disabled={busy} onClick={() => onReject(note)}>Afwijzen</Button>
      </div>
    </div>
  );
}

function PersonPanel() {
  const find = useServerFn(adminFindAccount);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<Awaited<ReturnType<typeof find>>>(null);
  const [searched, setSearched] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4" />
        <h2 className="text-lg font-medium">Nieuwe Persoon Verifiëren</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Zoek het account, vul voor- en achternaam in; de handle wordt automatisch gemaakt en de badge toegekend.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try { setAccount(await find({ data: { query } })); setSearched(true); }
          catch { toast.error(trI18n.t("ui.bc6ea5d2d1")); }
        }}
      >
        <Input placeholder="E-mail of @handle" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="outline">Zoeken</Button>
      </form>
      {searched && !account && <p className="mt-3 text-sm text-muted-foreground">Geen account gevonden.</p>}
      {account && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-border p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{account.displayName || account.email}</p>
            <p className="truncate text-xs text-muted-foreground">@{account.username ?? "—"} · {account.email}</p>
          </div>
          <VerifyUserDialog
            userId={account.id}
            displayName={account.displayName}
            alreadyVerified={account.verified}
            onDone={() => { setAccount(null); setSearched(false); setQuery(""); }}
          />
        </div>
      )}
    </section>
  );
}
