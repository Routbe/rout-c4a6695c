import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SpatialChoice } from "@/components/ui/spatial-choice";
import { cn } from "@/lib/utils";
import { NoneGlyph } from "./NoneGlyph";
import { SelectionIndicator } from "./SelectionIndicator";
import { PickerAnnouncer } from "./PickerAnnouncer";
import { FinderMarkGlyph } from "./FinderMarkGlyph";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";

export type ThemeCategory = "minimal" | "vibrant" | "dark" | "brand";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  fgColor: string;
  bgColor: string;
  bgGradient?: string;
  /** Pattern preset applied together with the colours. */
  shape: "square" | "dots" | "rounded" | "classy";
  /** Filter-chip bucket for inline discovery. */
  category: ThemeCategory;
}

const g = (s: string) => s.replace(/\s+/g, " ").trim();

export const themePresets: ThemePreset[] = [
  {
    id: "transparent",
    shape: "square",
    category: "minimal",
    name: "Geen",
    description: "Transparante achtergrond",
    fgColor: "#78716c",
    bgColor: "transparent",
  },
  {
    id: "paper",
    shape: "rounded",
    category: "minimal",
    name: "Paper",
    description: "Soft, minimal",
    fgColor: "#3d3225",
    bgColor: "#faf6f0",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #f5ede3 0%, transparent 50%),
      radial-gradient(ellipse at 100% 0%, #ebe4d8 0%, transparent 50%),
      radial-gradient(ellipse at 100% 100%, #f0e6d6 0%, transparent 50%),
      radial-gradient(ellipse at 0% 100%, #faf6f0 0%, transparent 50%),
      linear-gradient(135deg, #faf6f0 0%, #f5ede3 100%)
    `),
  },
  {
    id: "midnight",
    shape: "dots",
    category: "dark",
    name: "Midnight",
    description: "Dark, high contrast",
    fgColor: "#ffffff",
    bgColor: "#1e293b",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #334155 0%, transparent 50%),
      radial-gradient(ellipse at 100% 50%, #1e3a5f 0%, transparent 50%),
      radial-gradient(ellipse at 50% 100%, #312e81 0%, transparent 50%),
      linear-gradient(160deg, #0f172a 0%, #020617 100%)
    `),
  },
  {
    id: "pastel",
    shape: "rounded",
    category: "vibrant",
    name: "Pastel",
    description: "Soft, dreamy",
    fgColor: "#7a3f57",
    bgColor: "#fdf6f3",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #fce7f3 0%, transparent 50%),
      radial-gradient(ellipse at 100% 0%, #e9d5ff 0%, transparent 50%),
      radial-gradient(ellipse at 100% 100%, #fbcfe8 0%, transparent 50%),
      linear-gradient(135deg, #fdf6f3 0%, #fce7f3 100%)
    `),
  },
  {
    id: "forest",
    shape: "classy",
    category: "brand",
    name: "Forest",
    description: "Deep green, natural",
    fgColor: "#0f3d2e",
    bgColor: "#eef7f1",
    bgGradient: g(`
      radial-gradient(ellipse at 20% 0%, #d7ede0 0%, transparent 55%),
      linear-gradient(150deg, #f3faf5 0%, #dcefe4 100%)
    `),
  },
  {
    id: "sunset",
    shape: "rounded",
    category: "vibrant",
    name: "Sunset",
    description: "Warm amber glow",
    fgColor: "#4a1d05",
    bgColor: "#fff3e2",
    bgGradient: g(`
      radial-gradient(ellipse at 100% 0%, #ffd9a8 0%, transparent 55%),
      linear-gradient(135deg, #fff6ea 0%, #ffe1bd 100%)
    `),
  },
  {
    id: "ocean",
    shape: "dots",
    category: "brand",
    name: "Ocean",
    description: "Cool marine blue",
    fgColor: "#08304d",
    bgColor: "#e9f4fb",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 100%, #c5e4f7 0%, transparent 55%),
      linear-gradient(135deg, #f0f8fd 0%, #d3e9f8 100%)
    `),
  },
  {
    id: "mono",
    shape: "square",
    category: "minimal",
    name: "Mono",
    description: "Pure black on white",
    fgColor: "#000000",
    bgColor: "#ffffff",
  },
  {
    id: "inverted",
    shape: "square",
    category: "dark",
    name: "Inverted",
    description: "White on black",
    fgColor: "#ffffff",
    bgColor: "#000000",
  },
  {
    id: "neon",
    shape: "dots",
    category: "vibrant",
    name: "Neon",
    description: "Electric on charcoal",
    fgColor: "#2EE59D",
    bgColor: "#0b0f0d",
    bgGradient: g(`
      radial-gradient(ellipse at 50% 0%, #123a2c 0%, transparent 60%),
      linear-gradient(160deg, #0b0f0d 0%, #05100c 100%)
    `),
  },
  {
    id: "blueprint",
    shape: "square",
    category: "brand",
    name: "Blueprint",
    description: "Draughtsman blue",
    fgColor: "#e8f1ff",
    bgColor: "#123a6b",
    bgGradient: g(`
      radial-gradient(ellipse at 0% 0%, #1c4d8a 0%, transparent 55%),
      linear-gradient(140deg, #143f75 0%, #0d2c52 100%)
    `),
  },
  {
    id: "terracotta",
    shape: "classy",
    category: "brand",
    name: "Terracotta",
    description: "Earthy clay tones",
    fgColor: "#5b2116",
    bgColor: "#fbeee7",
    bgGradient: g(`
      radial-gradient(ellipse at 100% 100%, #f2d3c4 0%, transparent 55%),
      linear-gradient(135deg, #fdf2ec 0%, #f0d5c7 100%)
    `),
  },
];

interface ThemePresetsProps {
  selectedTheme: string;
  onThemeChange: (theme: ThemePreset) => void;
}

const FILTERS: { id: "all" | ThemeCategory; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "minimal", label: "Minimaal" },
  { id: "vibrant", label: "Kleurrijk" },
  { id: "dark", label: "Donker" },
  { id: "brand", label: "Merk" },
];

/**
 * Themavoorbeeld: een klein afgerond kaartje met de drie finder-markers van
 * een QR-code (hoekvierkanten linksboven, rechtsboven, linksonder) in de
 * voorgrondkleur op de achtergrondkleur van het thema. De optie "Geen" toont
 * overal hetzelfde ø-teken.
 */
function ThemeSwatch({ theme }: { theme: ThemePreset }) {
  if (theme.id === "transparent") return <NoneGlyph />;

  return (
    <FinderMarkGlyph
      fgColor={theme.fgColor}
      bg={theme.bgGradient || theme.bgColor}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 p-1"
    />
  );
}

/**
 * Zero-popup theme engine: clean grid of compact tiles matching the density
 * of the other shape pickers (e.g. Outer finder frames).
 */
export function ThemePresets({ selectedTheme, onThemeChange }: ThemePresetsProps) {
  const [filter, setFilter] = useState<"all" | ThemeCategory>("all");
  const group = useRovingRadioGroup<HTMLDivElement>();
  const visible = useMemo(
    () => (filter === "all" ? themePresets : themePresets.filter((t) => t.category === filter)),
    [filter],
  );

  const selectedPreset = themePresets.find((theme) => theme.id === selectedTheme);
  return (
    <div className="space-y-2">
      <PickerAnnouncer message={selectedPreset ? `${selectedPreset.name} theme selected` : ""} />
      <div data-testid="theme-filters" className="min-w-0 overflow-x-auto pb-1">
        <SpatialChoice value={filter} onChange={(v) => setFilter(v as typeof filter)} label="Themacategorie" options={FILTERS.map(f => ({ value: f.id, label: f.label }))} className="w-max min-w-full" />
      </div>

      <div
        key={filter}
        role="radiogroup"
        aria-label="Theme preset"
        tabIndex={-1}
        ref={group.ref}
        onKeyDown={group.onKeyDown}
        data-testid="theme-carousel"
        className="grid animate-in fade-in grid-cols-3 gap-2 overflow-visible px-1.5 pt-2.5 duration-200 sm:grid-cols-4 md:grid-cols-4"
      >
        {visible.map((theme) => {
          const selected = selectedTheme === theme.id;
          return (
            <Button variant="outline"
              key={theme.id}
              type="button"
              onClick={() => onThemeChange(theme)}
              title={theme.description}
              role="radio"
              aria-checked={selected}
              aria-label={theme.name}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "spatial-choice-tile relative flex h-20 w-full min-w-0 flex-col items-center justify-center gap-2 overflow-visible rounded-lg px-2 py-2 text-xs font-medium",
                selected ? "border-chamfer-light" : "border-hardware-edge",
              )}
            >
              <SelectionIndicator visible={selected} />
              <ThemeSwatch theme={theme} />
              <span className="w-full truncate px-1 text-center">{theme.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
