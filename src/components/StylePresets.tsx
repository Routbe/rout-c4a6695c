import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Download, Plus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  FACTORY_PRESETS,
  loadPresets,
  savePresets,
  findPresetByName,
  snapshotMatches,
  normalizeSnapshot,
  PRESET_SCHEMA_VERSION,
  serializePresetFile,
  type QrStylePreset,
  type QrStyleSnapshot,
} from "@/lib/qr-presets";
import { ingestPresetFile, MAX_PRESET_FILE_BYTES, utf8Bytes } from "@/lib/preset-schema";

interface StylePresetsProps {
  current: QrStyleSnapshot;
  onApply: (style: QrStyleSnapshot) => void;
}

/**
 * Save / apply / delete QR style presets. Reads and writes go through the
 * defensive helpers in `qr-presets`, so corrupt storage degrades to the
 * factory set instead of crashing the sidebar.
 */
export function StylePresets({ current, onApply }: StylePresetsProps) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<QrStylePreset[]>(FACTORY_PRESETS);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate after mount: localStorage does not exist during SSR.
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const persist = useCallback((next: QrStylePreset[]) => {
    setPresets(next);
    savePresets(next.filter((p) => !p.factory));
  }, []);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = findPresetByName(presets, trimmed);
    if (existing?.factory) {
      toast({
        title: "Name in use",
        description: "Built-in presets cannot be overwritten — pick another name.",
        variant: "destructive",
      });
      return;
    }
    const snapshot = normalizeSnapshot(current);
    const preset: QrStylePreset = existing
      ? { ...existing, style: snapshot }
      : {
          id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: trimmed.slice(0, 40),
          version: PRESET_SCHEMA_VERSION,
          style: snapshot,
        };
    persist(
      existing ? presets.map((p) => (p.id === existing.id ? preset : p)) : [...presets, preset],
    );
    setName("");
    setAdding(false);
    toast({ title: existing ? "Preset updated" : "Preset saved", description: preset.name });
  };

  const handleDelete = (preset: QrStylePreset) => {
    persist(presets.filter((p) => p.id !== preset.id));
    toast({ title: "Preset deleted", description: preset.name });
  };

  /** Download every custom preset as a portable .json file. */
  const handleExport = () => {
    const custom = presets.filter((p) => !p.factory);
    if (!custom.length) {
      toast({
        title: "Niets te exporteren",
        description: "Sla eerst een eigen stijl op.",
        variant: "destructive",
      });
      return;
    }
    const blob = new Blob([serializePresetFile(custom)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-styles-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "Stijlen geëxporteerd", description: `${custom.length} preset(s) opgeslagen.` });
  };

  /** Merge an uploaded .json preset file into local storage. */
  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    // Gatekeeper 1 — size and declared type, before a single byte is parsed.
    if (file.size > MAX_PRESET_FILE_BYTES) {
      toast({
        title: "Import mislukt",
        description: `File exceeds maximum size limit (${Math.round(file.size / 1024)} KB van max ${MAX_PRESET_FILE_BYTES / 1024} KB).`,
        variant: "destructive",
      });
      return;
    }
    if (file.type && !/json|text/i.test(file.type)) {
      toast({
        title: "Import mislukt",
        description: "Alleen .json bestanden kunnen geïmporteerd worden.",
        variant: "destructive",
      });
      return;
    }
    try {
      const text = await file.text();
      if (utf8Bytes(text) > MAX_PRESET_FILE_BYTES) {
        toast({
          title: "Import mislukt",
          description: "File exceeds maximum size limit.",
          variant: "destructive",
        });
        return;
      }
      // Gatekeeper 2 — zero-trust schema validation and property stripping.
      const result = ingestPresetFile(text);
      if (!result.ok) {
        toast({
          title: "Import mislukt",
          description: "reason" in result ? result.reason : "Onbekende fout.",
          variant: "destructive",
        });
        return;
      }
      const incoming = result.presets;
      // Salvaged fields are reported so the user can repair their file.
      if (result.issues.length) {
        console.warn("[presets] sanitised import", result.issues);
        toast({
          title: "Preset gedeeltelijk hersteld",
          description: `${result.issues[0].message} (${result.issues.length} veld(en) teruggezet op veilige standaard).`,
        });
      }
      // Name collisions overwrite the existing custom preset, never a factory one.
      const merged = [...presets];
      let added = 0;
      for (const preset of incoming) {
        const clash = findPresetByName(merged, preset.name);
        if (clash?.factory) {
          merged.push({ ...preset, name: `${preset.name} (import)`.slice(0, 40) });
          added += 1;
        } else if (clash) {
          const at = merged.indexOf(clash);
          merged[at] = { ...clash, style: preset.style };
        } else {
          merged.push(preset);
          added += 1;
        }
      }
      persist(merged);
      toast({
        title: "Stijlen geïmporteerd",
        description: `${incoming.length} preset(s), ${added} nieuw.`,
      });
    } catch (error) {
      console.error("[presets] import failed", error);
      toast({
        title: "Import mislukt",
        description: "Bestand kon niet gelezen worden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Style presets</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Save current
        </button>
      </div>

      {adding && (
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Preset name"
            maxLength={40}
            className="h-9 rounded-xl bg-background border-border input-field"
          />
          <Button size="sm" data-testid="preset-save" onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = snapshotMatches(preset.style, normalizeSnapshot(current));
          return (
            <span
              key={preset.id}
              className={cn(
                "group relative overflow-hidden inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1.5 h-8 text-[11px] font-medium transition-all",
                active
                  ? "gradient-border-selected text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                onClick={() => onApply(preset.style)}
                className="inline-flex items-center gap-1.5"
                title={preset.factory ? "Built-in preset" : "Custom preset"}
              >
                <Bookmark className="h-3 w-3" aria-hidden />
                {preset.name}
              </button>
              {!preset.factory && (
                <button
                  type="button"
                  onClick={() => handleDelete(preset)}
                  aria-label={`Delete ${preset.name}`}
                  className="rounded-full p-1 text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Sovereign data control — presets live in a file the user owns. */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          type="button"
          data-testid="presets-export"
          onClick={handleExport}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Download className="h-3 w-3" aria-hidden />
          Export styles (JSON)
        </button>
        <button
          type="button"
          data-testid="presets-import"
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Upload className="h-3 w-3" aria-hidden />
          Import styles
        </button>
        <input
          ref={fileRef}
          data-testid="presets-import-input"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void handleImport(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
