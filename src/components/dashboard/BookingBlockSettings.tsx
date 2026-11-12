import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import {
  BOOKING_DURATIONS,
  parseBookingConfig,
  serializeBookingConfig,
  type BookingConfig,
} from "@/lib/booking";

/** Studio-paneel voor het native `booking_request`-component. */
export function BookingBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const { t } = useI18n();
  const config = parseBookingConfig(value);

  const update = (patch: Partial<BookingConfig>) => {
    const next = { ...config, ...patch };
    onChange(serializeBookingConfig(next));
    if (patch.title !== undefined) onTitle(patch.title);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Booking / Afspraak</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Plan een afspraak / gesprek"
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="Titel"
      />
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Kies een datum en tijdstip voor een korte kennismaking"
        maxLength={160}
        value={config.note}
        onChange={(e) => update({ note: e.target.value })}
        aria-label="Toelichting"
      />

      <label className="block text-[11px] text-muted-foreground" htmlFor="booking-duration">
        Duur
      </label>
      <select
        id="booking-duration"
        value={config.duration}
        onChange={(e) => update({ duration: Number(e.target.value) as BookingConfig["duration"] })}
        className="h-9 w-full rounded-xl border border-border bg-background px-2 text-sm"
      >
        {BOOKING_DURATIONS.map((d) => (
          <option key={d} value={d}>
            {d} min
          </option>
        ))}
      </select>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => update({ mode: "direct" })}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
            config.mode === "direct"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          ROUT Direct Request
        </button>
        <button
          type="button"
          onClick={() => update({ mode: "embed" })}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
            config.mode === "embed"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Cal.com / Google embed
        </button>
      </div>

      {config.mode === "direct" && (
        <label className="flex items-center justify-between gap-3 text-xs">
          {t("booking.widget.showSlots")}
          <Switch checked={config.showSlots} onCheckedChange={(showSlots) => update({ showSlots })} />
        </label>
      )}

      {config.mode === "embed" ? (
        <Input
          className="input-field h-9 rounded-xl"
          placeholder="https://cal.com/jouwnaam/30min"
          maxLength={300}
          value={config.embedUrl}
          onChange={(e) => update({ embedUrl: e.target.value })}
          aria-label="Agenda-URL"
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Aanvragen komen per e-mail binnen met knoppen om te aanvaarden of te weigeren. Bij
          aanvaarding krijgt de gast automatisch een .ics-uitnodiging.
        </p>
      )}
    </div>
  );
}
