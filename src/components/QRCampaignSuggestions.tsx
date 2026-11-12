import { useId, useState } from "react";
import { Check, ChevronDown, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QR_PRESETS, buildPresetSuggestion, qrDestinationSchema } from "@/lib/qr-campaign-presets";

type Suggestion = { label: string; callToAction: string; destination: string };

/** QR Smart Labels: on-device presets (UTM, events, campaigns). Collapsed by default. */
export function QRCampaignSuggestions({ destination, onApply }: { destination: string; onApply: (url: string, label: string, cta: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [campaign, setCampaign] = useState("");
  const [addUtm, setAddUtm] = useState(true);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState("");
  const target = url ?? destination;

  function choose(nextId: string, overrides: { campaign?: string; addUtm?: boolean; url?: string } = {}) {
    const preset = QR_PRESETS.find((p) => p.id === nextId);
    if (!preset) return;
    setPresetId(nextId);
    const dest = overrides.url ?? target;
    if (!qrDestinationSchema.safeParse(dest).success) {
      setSuggestion(null);
      setError("Vul eerst een veilige https:// bestemming in.");
      return;
    }
    setError("");
    setSuggestion(buildPresetSuggestion(preset, { destination: dest, campaign: overrides.campaign ?? campaign, addUtm: overrides.addUtm ?? addUtm }));
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-5 border-b border-border pb-5">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-2"><Tags aria-hidden="true" className="h-4 w-4" />QR Smart Labels</span>
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            {open ? "Inklappen" : "Campagnes & UTM"}
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`}>Bestemming</Label>
          <Input id={`${id}-url`} type="url" value={target} placeholder="https://…" maxLength={2048}
            onChange={(e) => { setUrl(e.target.value); if (presetId) choose(presetId, { url: e.target.value }); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-campaign`}>Campagnenaam (optioneel)</Label>
          <Input id={`${id}-campaign`} value={campaign} placeholder="Zomerfeest 2026" maxLength={40}
            onChange={(e) => { setCampaign(e.target.value); if (presetId) choose(presetId, { campaign: e.target.value }); }} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sjablonen">
          {QR_PRESETS.map((preset) => (
            <Button key={preset.id} type="button" size="sm" variant={presetId === preset.id ? "default" : "outline"} className="rounded-full"
              aria-pressed={presetId === preset.id} onClick={() => choose(preset.id)}>
              {preset.name}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={addUtm} onCheckedChange={(v) => { const next = v === true; setAddUtm(next); if (presetId) choose(presetId, { addUtm: next }); }} />
          UTM-tags toevoegen voor statistieken
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {suggestion && (
          <div className="space-y-3 border-t border-border pt-3" aria-live="polite">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-label`}>Label</Label>
              <Input id={`${id}-label`} value={suggestion.label} maxLength={60} onChange={(e) => setSuggestion({ ...suggestion, label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-cta`}>Oproep tot actie</Label>
              <Input id={`${id}-cta`} value={suggestion.callToAction} maxLength={80} onChange={(e) => setSuggestion({ ...suggestion, callToAction: e.target.value })} />
            </div>
            <p className="break-all text-xs text-muted-foreground">{suggestion.destination}</p>
            <Button type="button" variant="outline" className="w-full" disabled={!suggestion.label.trim() || !suggestion.callToAction.trim()}
              onClick={() => onApply(suggestion.destination, suggestion.label, suggestion.callToAction)}>
              <Check aria-hidden="true" className="h-4 w-4" />Gebruik dit label
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
