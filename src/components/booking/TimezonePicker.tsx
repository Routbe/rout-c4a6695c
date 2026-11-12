import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  formatOffset,
  matchesZone,
  timezoneOptions,
  zoneOffset,
} from "@/lib/booking-engine/guest-view-rules";

type Props = { value: string; device: string; onChange: (tz: string, explicit: boolean) => void };

/** Shown first on an empty search: where ROUT's visitors mostly are, after the current and device zone. */
const POPULAR = [
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "UTC",
];

/** Searchable list of every time zone, by city, region or offset; the device zone is always one click away. */
export function TimezonePicker({ value, device, onChange }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Offsets of today: a list opened in summer shows summer offsets.
  const options = useMemo(
    () => (open ? timezoneOptions(new Date(), [value, device]) : []),
    [open, value, device],
  );
  const shown = useMemo(() => options.filter((o) => matchesZone(o, query)), [options, query]);
  const suggested = useMemo(() => {
    const ids = [...new Set([value, device, ...POPULAR])];
    return ids
      .map((id) => options.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
  }, [options, value, device]);
  const [active, setActive] = useState("");
  const label = (id: string) =>
    `${id.split("/").pop()!.replace(/_/g, " ")} (${formatOffset(zoneOffset(id, new Date()))})`;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setActive(o ? `s:${value}` : "");
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="soft"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={t("booking.public.tzChange")}
          className="max-w-full justify-between gap-2"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label(value)}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="end">
        <Command shouldFilter={false} value={active} onValueChange={setActive} loop>
          <CommandInput
            value={query}
            onValueChange={(q) => {
              setQuery(q);
              setActive("");
            }}
            placeholder={t("booking.public.tzSearch")}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("booking.public.tzNoResults")}</CommandEmpty>
            {!query && (
              <CommandGroup heading={t("booking.public.tzSuggested")}>
                {value !== device && (
                  <CommandItem
                    value={`device:${device}`}
                    onSelect={() => {
                      onChange(device, false);
                      setOpen(false);
                    }}
                  >
                    <LocateFixed className="h-4 w-4" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {t("booking.public.tzUseDevice", { tz: label(device) })}
                    </span>
                  </CommandItem>
                )}
                {suggested.map((o) => (
                  <CommandItem
                    key={`s:${o.id}`}
                    value={`s:${o.id}`}
                    onSelect={() => {
                      onChange(o.id, o.id !== device);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", o.id === value ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {o.city}
                      {o.region && <span className="opacity-70"> · {o.region}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums opacity-70">
                      {o.offsetLabel}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={query ? undefined : t("booking.public.tzAll")}>
              {shown.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    onChange(o.id, o.id !== device);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("h-4 w-4", o.id === value ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {o.city}
                    {o.region && <span className="opacity-70"> · {o.region}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums opacity-70">
                    {o.offsetLabel}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
