import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

/** De mediakanalen die de rondleiding aanbiedt (de rest volgt in de Studio). */
export const TOUR_SOCIALS = [
  { kind: "instagram", label: "Instagram", placeholder: "@jouwnaam" },
  { kind: "tiktok", label: "TikTok", placeholder: "@jouwnaam" },
  { kind: "youtube", label: "YouTube", placeholder: "@jouwkanaal" },
  { kind: "x", label: "X", placeholder: "@jouwnaam" },
  { kind: "linkedin", label: "LinkedIn", placeholder: "in/jouwnaam" },
  { kind: "github", label: "GitHub", placeholder: "jouwnaam" },
  { kind: "website", label: "Website", placeholder: "https://jouwsite.be" },
] as const;

/** Stap 2: mediakanalen toevoegen — elk ingevuld veld verschijnt live rechts. */
export function TourSocialsStep({
  socials,
  onChange,
}: {
  socials: Record<string, string>;
  onChange: (kind: string, value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.socials.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.socials.body")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOUR_SOCIALS.map((item) => (
          <div key={item.kind} className="space-y-1.5">
            <Label htmlFor={`tour-${item.kind}`}>{item.label}</Label>
            <Input
              id={`tour-${item.kind}`}
              value={socials[item.kind] ?? ""}
              onChange={(e) => onChange(item.kind, e.target.value)}
              placeholder={item.placeholder.replace("jouwnaam", t("tour.socials.exName")).replace("jouwkanaal", t("tour.socials.exChannel")).replace("jouwsite", t("tour.socials.exSite"))}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
