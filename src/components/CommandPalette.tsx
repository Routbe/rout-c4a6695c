import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { AtSign, Building2, CalendarDays, Code2, Compass, KeyRound, LayoutDashboard, QrCode, Settings, Sparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { parseOmniInput } from "@/lib/omni-parser";
import { useI18n } from "@/lib/i18n";
import { TOURS, TOUR_IDS, type TourId } from "@/lib/tour/definitions";
import { startTour } from "@/lib/tour/progress";

const ITEMS = [
  { group: "palette.navigation", label: "menu.studio.label", to: "/studio", Icon: Sparkles, keywords: "profiel ontwerp profile design profil" },
  { group: "palette.navigation", label: "palette.dashboard", to: "/dashboard", Icon: LayoutDashboard, keywords: "cockpit beheer" },
  { group: "palette.navigation", label: "menu.agenda.label", to: "/agenda", Icon: CalendarDays, keywords: "afspraak boeking kalender booking calendar rendez-vous" },
  { group: "palette.navigation", label: "palette.workspaces", to: "/dashboard", Icon: Building2, keywords: "team workspace" },
  { group: "palette.navigation", label: "palette.explore", to: "/explore", Icon: Compass, keywords: "zoeken search recherche suchen" },
  { group: "palette.actions", label: "palette.generate", to: "/qr-code-generator", Icon: QrCode, keywords: "qr" },
  { group: "palette.actions", label: "palette.tokens", to: "/console/api", Icon: KeyRound, keywords: "api sleutel herroepen token key" },
  { group: "palette.actions", label: "palette.settings", to: "/settings", Icon: Settings, keywords: "account" },
  { group: "palette.developers", label: "menu.docs.label", to: "/developers", Icon: Code2, keywords: "api mcp openapi llms" },
] as const;

/** Global Cmd/Ctrl+K command center, mounted once in the root layout. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const intent = useMemo(() => parseOmniInput(query), [query]);
  const { t } = useI18n();

  // Navigate first so the tour never starts on the wrong page, then force-reset it.
  const runTour = async (id: TourId) => {
    setOpen(false);
    setQuery("");
    await router.navigate({ to: TOURS[id].path });
    startTour(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("rout:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("rout:command-palette", onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    void router.navigate({ href });
  };

  const groups = [...new Set(ITEMS.map((i) => i.group))];
  const routable = intent.kind === "url" || intent.kind === "handle" || intent.kind === "command";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("palette.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        {routable && (
          <CommandGroup heading={t("palette.routing")}>
            <CommandItem value={`route ${query}`} onSelect={() => go(intent.destination)}>
              {intent.kind === "url" ? <QrCode /> : <AtSign />}
              {intent.kind === "url" ? t("palette.qrLink") : intent.kind === "handle" ? t("palette.openProfile", { handle: intent.handle }) : t("palette.command", { command: intent.command })}
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}
        {groups.map((g) => (
          <CommandGroup key={g} heading={t(g)}>
            {ITEMS.filter((i) => i.group === g).map(({ label, to, Icon, keywords }) => (
              <CommandItem key={label} value={`${t(label)} ${keywords}`} onSelect={() => go(to)}>
                <Icon /> {t(label)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading={t("tourEngine.palette.group")}>
          {TOUR_IDS.map((id) => (
            <CommandItem key={id} value={`tour rondleiding ${t(`tourEngine.palette.${id}`)}`} onSelect={() => void runTour(id)}>
              <Sparkles /> {t(`tourEngine.palette.${id}`)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
