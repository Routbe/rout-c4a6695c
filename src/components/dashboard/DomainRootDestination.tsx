import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDomainRootRedirect } from "@/lib/domains.functions";
import type { RootRedirectType } from "@/lib/root-redirect";
import { i18n as trI18n } from "@/lib/i18n";

const OPTIONS: { value: RootRedirectType; label: string }[] = [
  { value: "profile_hub", label: "Mijn Profiel Hub (Aanbevolen)" },
  { value: "custom_url", label: "Externe website" },
  { value: "rout_main", label: "ROUT Hoofdpagina (rout.be)" },
];

/** Root destination of one verified custom domain (db/0128). */
export function DomainRootDestination(props: { id: string; domain: string; type?: string | null; url?: string | null }) {
  const [type, setType] = useState<RootRedirectType>((props.type as RootRedirectType) || "profile_hub");
  const [url, setUrl] = useState(props.url ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await setDomainRootRedirect({ data: { id: props.id, type, url: type === "custom_url" ? url : null } });
      toast.success(trI18n.t("ui.2f4398c69f"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="w-full space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">Root-bestemming voor {props.domain}</legend>
      <p className="text-xs text-muted-foreground">
        Bepaal waar bezoekers heen gaan als ze rechtstreeks naar je domein surfen (zonder specifieke link-code).
      </p>
      {OPTIONS.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
          <input type="radio" name={`root-${props.id}`} value={o.value} checked={type === o.value} onChange={() => setType(o.value)} />
          {o.label}
        </label>
      ))}
      {type === "custom_url" && (
        <Input type="url" inputMode="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Externe website" />
      )}
      <Button type="button" size="sm" onClick={save} disabled={busy}>
        Opslaan
      </Button>
    </fieldset>
  );
}
