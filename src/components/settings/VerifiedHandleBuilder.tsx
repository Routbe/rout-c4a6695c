import { useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import {
  DEFAULT_BUILDER_CONFIG,
  HANDLE_SEPARATOR_OPTIONS,
  STORAGE_SAFE_SEPARATORS,
  buildHandle,
  isLegallyTraceable,
  parseLegalName,
  surnameFull,
  surnameInitials,
  surnameSingleInitial,
  toStorageHandle,
  TRACEABILITY_MESSAGE,
  type FullnessMode,
  type HandleBuilderConfig,
  type HandleSeparator,
  type MiddleMode,
  type NameOrder,
} from "@/lib/verified-handle-builder";

interface Props {
  /** Volledige wettelijke naam op het profiel, bv. "Jona Zeno De Smet". */
  legalName: string | null;
  /** Host-prefix voor de live preview, bv. "rout.be/". */
  hostPrefix?: string;
  /** Wordt aangeroepen zodra de gebruiker de opgebouwde handle bevestigt. */
  onSelect: (handle: string) => void;
  disabled?: boolean;
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
        active
          ? "border-foreground/40 bg-foreground/5 text-foreground"
          : "border-border bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Stapsgewijze handle-bouwer voor geverifieerde leden.
 *
 * Stap 1 — volgorde en tussennaam · Stap 2 — voluit of afgekort ·
 * Stap 3 — scheidingsteken, met live preview en directe beschikbaarheidscheck.
 */
export function VerifiedHandleBuilder({
  legalName,
  hostPrefix = "rout.be/",
  onSelect,
  disabled,
}: Props) {
  const [config, setConfig] = useState<HandleBuilderConfig>(DEFAULT_BUILDER_CONFIG);
  const name = useMemo(() => parseLegalName(legalName), [legalName]);

  const preview = name ? buildHandle(name, config) : "";
  const storage = toStorageHandle(preview);
  const traceable = name ? isLegallyTraceable(name, storage) : false;
  const availability = useHandleAvailability(storage, !traceable);

  if (!name) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
        Vul eerst je wettelijke voor- en achternaam in — die bepaalt welke gebruikersnamen je mag
        opbouwen.
      </div>
    );
  }

  const set = <K extends keyof HandleBuilderConfig>(key: K, value: HandleBuilderConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const hasMiddle = name.middleNames.length > 0;
  const compound = name.surnameParts.length > 1;
  const surnameLong = surnameFull(name.surnameParts);
  const shortInitials = surnameInitials(name.surnameParts);
  const shortSingle = surnameSingleInitial(name.surnameParts);

  const sample = (fullness: FullnessMode) => buildHandle(name, { ...config, fullness });

  const ready = traceable && availability.state === "available" && !disabled;
  const decorative = !STORAGE_SAFE_SEPARATORS.has(config.separator);

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium text-foreground">Gebruikersnaam-bouwer</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Voornaam <span className="font-mono">{name.firstName}</span>
          {hasMiddle ? (
            <>
              {" "}
              · tussennaam <span className="font-mono">{name.middleNames.join(" ")}</span>
            </>
          ) : null}{" "}
          · achternaam <span className="font-mono">{surnameLong}</span>
        </p>
      </div>

      {/* STAP 1 */}
      <div className="space-y-3" role="radiogroup" aria-label="Stap 1: volgorde en tussennaam">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Stap 1 · Volgorde &amp; onderdelen
        </p>
        <OptionRow label="Volgorde">
          {(
            [
              ["first-first", "Voornaam eerst"],
              ["surname-first", "Achternaam eerst"],
            ] as [NameOrder, string][]
          ).map(([value, label]) => (
            <Choice
              key={value}
              active={config.order === value}
              onClick={() => set("order", value)}
              disabled={disabled}
            >
              {label}
            </Choice>
          ))}
        </OptionRow>
        {hasMiddle ? (
          <OptionRow label="Tussennaam">
            {(
              [
                ["full", `Voluit (${name.middleNames.join(" ")})`],
                ["initial", `Initiaal (${name.middleNames.map((m) => m[0]).join("")})`],
                ["omit", "Weglaten"],
              ] as [MiddleMode, string][]
            ).map(([value, label]) => (
              <Choice
                key={value}
                active={config.middle === value}
                onClick={() => set("middle", value)}
                disabled={disabled}
              >
                {label}
              </Choice>
            ))}
          </OptionRow>
        ) : null}
      </div>

      {/* STAP 2 */}
      <div className="space-y-3" role="radiogroup" aria-label="Stap 2: voluit of afgekort">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Stap 2 · Voluit of afgekort
        </p>
        <OptionRow label="Minstens één naamdeel blijft altijd voluit">
          {(
            [
              ["all-full", "A · Alles voluit"],
              ["surname-short", "B · Achternaam afgekort"],
              ["first-short", "C · Voornaam afgekort"],
            ] as [FullnessMode, string][]
          ).map(([value, label]) => (
            <Choice
              key={value}
              active={config.fullness === value}
              onClick={() => set("fullness", value)}
              disabled={disabled}
            >
              {label}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">{sample(value)}</span>
            </Choice>
          ))}
        </OptionRow>
        {config.fullness === "surname-short" && compound ? (
          <OptionRow label="Afkorting achternaam">
            <Choice
              active={config.surnameShortStyle === "initials"}
              onClick={() => set("surnameShortStyle", "initials")}
              disabled={disabled}
            >
              Alle tussenvoegsels{" "}
              <span className="ml-1 font-mono text-[10px]">{shortInitials}</span>
            </Choice>
            <Choice
              active={config.surnameShortStyle === "single"}
              onClick={() => set("surnameShortStyle", "single")}
              disabled={disabled}
            >
              Eén letter <span className="ml-1 font-mono text-[10px]">{shortSingle}</span>
            </Choice>
          </OptionRow>
        ) : null}
      </div>

      {/* STAP 3 */}
      <div className="space-y-3" role="radiogroup" aria-label="Stap 3: scheidingsteken">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Stap 3 · Scheidingsteken
        </p>
        <div className="flex flex-wrap gap-1.5">
          {HANDLE_SEPARATOR_OPTIONS.map((option) => (
            <Choice
              key={option.value || "none"}
              active={config.separator === option.value}
              onClick={() => set("separator", option.value as HandleSeparator)}
              disabled={disabled}
            >
              <span className="font-mono">{option.label}</span>
            </Choice>
          ))}
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <div className="rounded-xl border border-border bg-background/70 p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Live preview</p>
        <p className="mt-1 break-all font-mono text-base text-foreground">
          {hostPrefix}
          {preview || "…"}
        </p>
        {decorative ? (
          <p className="mt-1 break-all text-[11px] text-muted-foreground">
            Opgeslagen als{" "}
            <span className="font-mono">
              {hostPrefix}
              {storage}
            </span>{" "}
            — sierlijke tekens worden een punt in de echte URL.
          </p>
        ) : null}
        <p className="mt-2 text-xs">
          {!traceable ? (
            <span className="text-destructive">{TRACEABILITY_MESSAGE}</span>
          ) : availability.state === "checking" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Beschikbaarheid
              controleren…
            </span>
          ) : availability.state === "taken" ? (
            <span className="inline-flex items-center gap-1 font-mono text-destructive">
              <X className="h-3.5 w-3.5" aria-hidden /> @{storage} is al bezet
            </span>
          ) : availability.state === "available" ? (
            <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" aria-hidden /> @{storage} is vrij
            </span>
          ) : availability.state === "error" ? (
            <span className="text-muted-foreground">
              Kon de beschikbaarheid nu niet controleren.
            </span>
          ) : null}
        </p>
      </div>

      <Button type="button" disabled={!ready} onClick={() => onSelect(storage)} className="w-full">
        Handle opslaan
      </Button>
    </div>
  );
}
