import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { parseVCardConfig, type VCardConfig, type VCardPhoneType } from "@/lib/vcard";

const PHONE_TYPES: { id: VCardPhoneType; label: string }[] = [
  { id: "cell", label: "Mobiel" },
  { id: "work", label: "Werk" },
  { id: "home", label: "Thuis" },
];

/** Studio-paneel voor het "vCard / Visitekaartje"-component. */
export function VCardBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const c = parseVCardConfig(value);
  const update = (patch: Partial<VCardConfig>) => {
    onChange(JSON.stringify({ ...c, ...patch }));
    if (patch.label !== undefined) onTitle(patch.label || "Contact opslaan");
  };
  const field = "input-field h-9 rounded-xl";
  const lbl = "text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">vCard / Visitekaartje</p>
      <label className="block space-y-1">
        <span className={lbl}>Opschrift van de knop</span>
        <Input className={field} maxLength={40} placeholder="Contact opslaan" value={c.label} onChange={(e) => update({ label: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={lbl}>Functietitel</span>
          <Input className={field} maxLength={80} placeholder="bv. Product designer" value={c.title} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className={lbl}>Organisatie</span>
          <Input className={field} maxLength={80} placeholder="Bedrijfsnaam" value={c.org} onChange={(e) => update({ org: e.target.value })} />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className={lbl}>Telefoonnummers</span>
        {c.phones.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              aria-label={`Soort nummer ${i + 1}`}
              className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
              value={p.type}
              onChange={(e) => update({ phones: c.phones.map((x, j) => (j === i ? { ...x, type: e.target.value as VCardPhoneType } : x)) })}
            >
              {PHONE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <Input
              className={field}
              type="tel"
              maxLength={40}
              placeholder="+32 470 00 00 00"
              aria-label={`Telefoonnummer ${i + 1}`}
              value={p.number}
              onChange={(e) => update({ phones: c.phones.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)) })}
            />
            <button type="button" aria-label="Nummer verwijderen" className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => update({ phones: c.phones.filter((_, j) => j !== i) })}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {c.phones.length < 5 && (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => update({ phones: [...c.phones, { type: c.phones.length ? "work" : "cell", number: "" }] })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Nummer toevoegen
          </button>
        )}
      </div>

      <label className="block space-y-1">
        <span className={lbl}>Adres (optioneel)</span>
        <Input className={field} maxLength={200} placeholder="Straat 1, 1000 Brussel" value={c.address} onChange={(e) => update({ address: e.target.value })} />
      </label>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className={lbl}>Notitie in het adresboek</span>
          <button type="button" className="text-xs font-medium underline-offset-2 hover:underline" onClick={() => update({ noteUseBio: !c.noteUseBio })}>
            {c.noteUseBio ? "Zelf een notitie schrijven" : "Vul in met mijn bio"}
          </button>
        </div>
        {c.noteUseBio ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Je bio wordt als notitie meegestuurd.</p>
        ) : (
          <textarea
            aria-label="Notitie in het adresboek"
            className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            maxLength={300}
            placeholder="bv. Ontmoet via mijn ROUT-profiel"
            value={c.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        )}
      </div>

      <label className="block space-y-1">
        <span className={lbl}>Website (optioneel)</span>
        <Input className={field} type="url" maxLength={300} placeholder="Standaard: je ROUT-profiel" value={c.urlOverride} onChange={(e) => update({ urlOverride: e.target.value })} />
      </label>

      {(
        [
          ["includeAvatar", "Profielfoto meesturen"],
          ["includeEmail", "E-mailadres"],
          ["includeLinks", "Links & socials"],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <span className="text-sm">{label}</span>
          <Switch aria-label={label} checked={c[key]} onCheckedChange={(v) => update({ [key]: v })} />
        </div>
      ))}
    </div>
  );
}
