import { useMemo, useState } from "react";
import { Check, Code2, Copy, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { i18n as trI18n } from "@/lib/i18n";

type ThemeMode = "auto" | "light" | "dark";
type Size = "sm" | "md";

/**
 * Generator voor de "Verified on ROUT"-badge op de eigen site van de maker.
 * Output: één <a> met een <picture> — puur SVG via CDN-cache, geen JavaScript,
 * geen trackers, vaste afmetingen (geen layoutverschuiving).
 */
export function VerifiedBadgeCard({
  handle,
  verified = true,
  siteUrl = "https://rout.be",
}: {
  handle: string | null;
  verified?: boolean;
  siteUrl?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [size, setSize] = useState<Size>("md");
  const clean = (handle ?? "").replace(/^@+/, "").toLowerCase();

  const { html, light, dark, w, h } = useMemo(() => {
    const base = `${siteUrl}/api/public/badge/${clean}.svg`;
    const s = size === "sm" ? "&size=sm" : "";
    const lightUrl = `${base}?theme=light${s}`;
    const darkUrl = `${base}?theme=dark${s}`;
    const profile = verified ? `${siteUrl}/${clean}` : `${siteUrl}/u/${clean}`;
    const label = `@${clean}`;
    const width = Math.round(Math.max(190, 118 + label.length * 8) * (size === "sm" ? 0.7 : 1));
    const height = size === "sm" ? 28 : 40;
    const alt = `${verified ? "Verified on ROUT" : "Privacy Shield on ROUT"} — @${clean}`;
    const img = (src: string) =>
      `<img src="${src}" alt="${alt}" width="${width}" height="${height}" loading="lazy" decoding="async" style="display:block;border:0" />`;
    const snippet =
      mode === "auto"
        ? `<a href="${profile}" target="_blank" rel="noopener" style="display:inline-block;line-height:0">\n  <picture>\n    <source srcset="${darkUrl}" media="(prefers-color-scheme: dark)" />\n    ${img(lightUrl)}\n  </picture>\n</a>`
        : `<a href="${profile}" target="_blank" rel="noopener" style="display:inline-block;line-height:0">\n  ${img(mode === "dark" ? darkUrl : lightUrl)}\n</a>`;
    return { html: snippet, light: lightUrl, dark: darkUrl, w: width, h: height };
  }, [clean, siteUrl, verified, mode, size]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      toast.success(trI18n.t("ui.e59469ef52"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(trI18n.t("ui.106fe2c8f9"));
    }
  }

  if (!clean) return null;

  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
    <div className="inline-flex rounded-full border border-border p-0.5" role="radiogroup">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("rounded-full px-3 py-1 text-xs transition-colors", value === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Code2 className="h-4 w-4" aria-hidden />
          {verified ? "Badge voor je eigen site" : "Privacy Shield-badge"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{verified ? "Badge voor je eigen site" : "Privacy Shield-badge"}</DialogTitle>
        </DialogHeader>
        {!verified && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <Lock className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            De <strong>Verified on ROUT</strong>-badge is voorbehouden aan geverifieerde leden. Als gratis lid gebruik je de Privacy Shield-badge.
          </p>
        )}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Seg value={mode} onChange={(v) => setMode(v as ThemeMode)} options={[["auto", "Volgt de site"], ["light", "Licht"], ["dark", "Donker"]]} />
            <Seg value={size} onChange={(v) => setSize(v as Size)} options={[["md", "Standaard"], ["sm", "Klein"]]} />
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border">
            <div className="grid place-items-center bg-background p-5">
              <img src={mode === "dark" ? dark : light} alt="Voorbeeld op lichte site" width={w} height={h} />
            </div>
            <div className="grid place-items-center bg-foreground p-5">
              <img src={mode === "light" ? light : dark} alt="Voorbeeld op donkere site" width={w} height={h} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "auto"
              ? "Kiest automatisch licht of donker volgens de kleurmodus van de bezoeker. "
              : ""}
            Pure SVG, wereldwijd gecachet, zonder JavaScript of trackers. Plak dit in je footer.
          </p>
          <pre className="max-h-48 select-all overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-border/80 bg-muted/60 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            <code>{html}</code>
          </pre>
          <Button type="button" size="sm" onClick={copy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Gekopieerd!" : "Code kopiëren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VerifiedBadgeCard;
