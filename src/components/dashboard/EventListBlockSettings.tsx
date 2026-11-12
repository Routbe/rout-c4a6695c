import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  EMPTY_EVENT,
  EVENTS_MAX,
  parseEventListConfig,
  serializeEventListConfig,
  type EventItem,
  type EventListConfig,
} from "@/lib/events";

/** Studio-paneel voor de evenementen/agenda-lijst. */
export function EventListBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseEventListConfig(value);
  const update = (patch: Partial<EventListConfig>) => {
    const next = { ...config, ...patch };
    onChange(serializeEventListConfig(next));
    if (patch.title !== undefined) onTitle(patch.title || "Evenementen");
  };
  const patchItem = (index: number, patch: Partial<EventItem>) =>
    update({ items: config.items.map((it, j) => (j === index ? { ...it, ...patch } : it)) });

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Evenementen / Agenda</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel, bv. 'Aankomende optredens'"
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="Collectietitel"
      />

      {config.items.map((item, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border/60 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              className="input-field h-9 rounded-xl"
              placeholder="Titel van het evenement"
              maxLength={120}
              value={item.title}
              onChange={(e) => patchItem(i, { title: e.target.value })}
              aria-label={`Evenement ${i + 1} titel`}
            />
            {config.items.length > 1 && (
              <button
                type="button"
                aria-label="Evenement verwijderen"
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
                onClick={() => update({ items: config.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              type="date"
              className="input-field h-9 rounded-xl"
              value={item.date}
              onChange={(e) => patchItem(i, { date: e.target.value })}
              aria-label={`Evenement ${i + 1} datum`}
            />
            <Input
              type="time"
              className="input-field h-9 rounded-xl"
              value={item.time}
              onChange={(e) => patchItem(i, { time: e.target.value })}
              aria-label={`Evenement ${i + 1} tijd`}
            />
          </div>
          <Input
            className="input-field h-9 rounded-xl"
            placeholder="Locatie / venue"
            maxLength={120}
            value={item.venue}
            onChange={(e) => patchItem(i, { venue: e.target.value })}
            aria-label={`Evenement ${i + 1} locatie`}
          />
          <Input
            className="input-field h-9 rounded-xl"
            placeholder="Ticket- / RSVP-URL (optioneel)"
            maxLength={300}
            value={item.url}
            onChange={(e) => patchItem(i, { url: e.target.value })}
            aria-label={`Evenement ${i + 1} URL`}
          />
          <Input
            className="input-field h-9 rounded-xl"
            placeholder="Knoptekst, bv. 'Tickets (€15)'"
            maxLength={40}
            value={item.buttonLabel}
            onChange={(e) => patchItem(i, { buttonLabel: e.target.value })}
            aria-label={`Evenement ${i + 1} knoptekst`}
          />
        </div>
      ))}

      {config.items.length < EVENTS_MAX && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
          onClick={() => update({ items: [...config.items, { ...EMPTY_EVENT }] })}
        >
          <Plus className="h-3 w-3" aria-hidden /> Evenement toevoegen
        </button>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-1.5">
        <span className="text-[11px]">Verlopen evenementen automatisch verbergen</span>
        <Switch
          checked={config.autoHidePast}
          onCheckedChange={(on) => update({ autoHidePast: on })}
          aria-label="Verlopen evenementen verbergen"
        />
      </div>
    </div>
  );
}
