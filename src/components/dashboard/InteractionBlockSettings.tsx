import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  POLL_MAX_OPTIONS,
  parseFaqConfig,
  parseMapConfig,
  parsePollConfig,
  type FaqConfig,
  type MapConfig,
  type PollConfig,
} from "@/lib/interactions";

const panel = "space-y-2 rounded-xl border border-border/60 bg-background p-3";
const heading = "text-[11px] font-medium text-foreground";
const smallBtn =
  "inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted";

/** Studio-paneel voor de interactieve poll. */
export function PollBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parsePollConfig(value);
  const update = (patch: Partial<PollConfig>) => {
    const next = { ...config, ...patch };
    onChange(JSON.stringify(next));
    if (patch.question !== undefined) onTitle(patch.question || "Poll");
  };

  return (
    <div className={panel}>
      <p className={heading}>Interactieve poll</p>
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Welk project moet ik eerst bouwen?"
        maxLength={160}
        value={config.question}
        onChange={(e) => update({ question: e.target.value })}
        aria-label="Poll-vraag"
      />
      {config.options.map((option, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            className="input-field h-9 rounded-xl"
            placeholder={`Optie ${i + 1}`}
            maxLength={80}
            value={option}
            onChange={(e) =>
              update({ options: config.options.map((o, j) => (j === i ? e.target.value : o)) })
            }
            aria-label={`Optie ${i + 1}`}
          />
          {config.options.length > 2 && (
            <button
              type="button"
              aria-label="Optie verwijderen"
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
              onClick={() => update({ options: config.options.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {config.options.length < POLL_MAX_OPTIONS && (
        <button
          type="button"
          className={smallBtn}
          onClick={() => update({ options: [...config.options, ""] })}
        >
          <Plus className="h-3 w-3" aria-hidden /> Optie toevoegen
        </button>
      )}
    </div>
  );
}

/** Studio-paneel voor de FAQ-accordion. */
export function FaqBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseFaqConfig(value);
  const update = (patch: Partial<FaqConfig>) => {
    const next = { ...config, ...patch };
    onChange(JSON.stringify(next));
    if (patch.title !== undefined) onTitle(patch.title || "FAQ");
  };

  return (
    <div className={panel}>
      <p className={heading}>FAQ / Veelgestelde vragen</p>
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel"
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="FAQ-titel"
      />
      {config.items.map((item, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border/60 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              className="input-field h-9 rounded-xl"
              placeholder="Vraag"
              maxLength={160}
              value={item.q}
              onChange={(e) =>
                update({
                  items: config.items.map((it, j) => (j === i ? { ...it, q: e.target.value } : it)),
                })
              }
              aria-label={`Vraag ${i + 1}`}
            />
            {config.items.length > 1 && (
              <button
                type="button"
                aria-label="Vraag verwijderen"
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
                onClick={() => update({ items: config.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <textarea
            className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Antwoord"
            maxLength={800}
            value={item.a}
            onChange={(e) =>
              update({
                items: config.items.map((it, j) => (j === i ? { ...it, a: e.target.value } : it)),
              })
            }
            aria-label={`Antwoord ${i + 1}`}
          />
        </div>
      ))}
      {config.items.length < 12 && (
        <button
          type="button"
          className={smallBtn}
          onClick={() => update({ items: [...config.items, { q: "", a: "" }] })}
        >
          <Plus className="h-3 w-3" aria-hidden /> Vraag toevoegen
        </button>
      )}
    </div>
  );
}

/** Studio-paneel voor de locatie/kaart-embed. */
export function MapBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseMapConfig(value);
  const update = (patch: Partial<MapConfig>) => {
    const next = { ...config, ...patch };
    onChange(JSON.stringify(next));
    if (patch.label !== undefined) onTitle(patch.label || "Locatie");
  };

  return (
    <div className={panel}>
      <p className={heading}>Locatie & kaart</p>
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Grote Markt, Brussel"
        maxLength={200}
        value={config.address}
        onChange={(e) => update({ address: e.target.value })}
        aria-label="Adres"
      />
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Label (optioneel), bv. 'Onze studio'"
        maxLength={80}
        value={config.label}
        onChange={(e) => update({ label: e.target.value })}
        aria-label="Kaartlabel"
      />
    </div>
  );
}
