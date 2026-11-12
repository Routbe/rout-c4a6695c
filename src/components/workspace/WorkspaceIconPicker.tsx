import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAvatar } from "@/lib/avatar.functions";
import { compressImageToWebP } from "@/lib/image-compression";
import { WORKSPACE_ICONS, WORKSPACE_ICON_KEYS, resolveWorkspaceIcon, type WorkspaceIconKey } from "@/lib/workspace-icons";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { cn } from "@/lib/utils";
import { i18n as trI18n } from "@/lib/i18n";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type WorkspaceIconValue = { icon: WorkspaceIconKey | null; avatarUrl: string | null };

/** Icon grid (default follows the category) plus an optional own logo. */
export function WorkspaceIconPicker({ value, category, onChange }: { value: WorkspaceIconValue; category: string | null; onChange: (v: WorkspaceIconValue) => void }) {
  const upload = useServerFn(uploadAvatar);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const selected = value.avatarUrl ? null : resolveWorkspaceIcon(value.icon, category);

  const pick = async (file?: File) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return void toast.error(trI18n.t("ui.287b4a51fd"));
    if (file.size > 5 * 1024 * 1024) return void toast.error(trI18n.t("ui.c58410c3de"));
    setBusy(true);
    try {
      const blob: Blob = file.type === "image/gif" ? file : await compressImageToWebP(file, 400).catch(() => file);
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error("Bestand kon niet gelezen worden."));
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(blob);
      });
      const out = await upload({ data: { base64, contentType: (blob.type || file.type) as "image/png", purpose: "workspace-logo" } });
      if (!out.ok || !out.url) throw new Error(out.message ?? "Upload mislukt.");
      onChange({ ...value, avatarUrl: out.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload mislukt.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
          <WorkspaceIcon avatarUrl={value.avatarUrl} icon={value.icon} category={category} className={value.avatarUrl ? "h-14 w-14 rounded-xl" : "h-7 w-7"} />
        </div>
        <input ref={input} type="file" accept={ALLOWED.join(",")} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Eigen logo
        </Button>
        {value.avatarUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, avatarUrl: null })}>
            <X className="h-4 w-4" /> Logo weghalen
          </Button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Icoon">
        {WORKSPACE_ICON_KEYS.map((k) => {
          const Glyph = WORKSPACE_ICONS[k];
          const on = selected === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={k}
              onClick={() => onChange({ icon: k, avatarUrl: null })}
              className={cn("flex aspect-square items-center justify-center rounded-lg border transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              <Glyph className="h-5 w-5" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
