import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  parseContactFormConfig,
  serializeContactFormConfig,
  type ContactFormConfig,
} from "@/lib/contact-form";

/** Studio-paneel voor het contactformulier / e-mailcapture-blok. */
export function ContactFormBlockSettings({
  value,
  onChange,
  onTitle,
}: {
  value: string;
  onChange: (value: string) => void;
  onTitle: (label: string) => void;
}) {
  const config = parseContactFormConfig(value);
  const update = (patch: Partial<ContactFormConfig>) => {
    const next = { ...config, ...patch };
    onChange(serializeContactFormConfig(next));
    if (patch.title !== undefined) onTitle(patch.title || "Contactformulier");
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Contactformulier & nieuwsbrief</p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Titel"
        maxLength={80}
        value={config.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="Formuliertitel"
      />
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Ondertitel (optioneel)"
        maxLength={140}
        value={config.subtitle}
        onChange={(e) => update({ subtitle: e.target.value })}
        aria-label="Ondertitel"
      />

      <div className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-1.5">
        <span className="text-[11px]">Naamveld tonen</span>
        <Switch
          checked={config.nameField}
          onCheckedChange={(on) => update({ nameField: on })}
          aria-label="Naamveld tonen"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-1.5">
        <span className="text-[11px]">Berichtveld tonen</span>
        <Switch
          checked={config.messageField}
          onCheckedChange={(on) => update({ messageField: on })}
          aria-label="Berichtveld tonen"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Het e-mailveld staat altijd aan — inzendingen komen in je dashboard én per mail binnen.
      </p>

      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Bedanktbericht"
        maxLength={160}
        value={config.successMessage}
        onChange={(e) => update({ successMessage: e.target.value })}
        aria-label="Succesbericht"
      />
      <Input
        className="input-field h-9 rounded-xl"
        placeholder="Redirect-URL na verzenden (optioneel)"
        maxLength={300}
        value={config.redirectUrl}
        onChange={(e) => update({ redirectUrl: e.target.value })}
        aria-label="Redirect-URL"
      />
    </div>
  );
}
