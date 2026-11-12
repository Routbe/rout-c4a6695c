import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ProfileBlock } from "@/lib/profile";
import { IMPORT_MAX_BYTES, mergeImportedBlocks, parseProfileImport, type ProfileImport } from "@/lib/profile-import";

interface Props {
  blocks: ProfileBlock[];
  onBlocksChange: Dispatch<SetStateAction<ProfileBlock[]>>;
  /** Optional: also take over name and subtitle from the file. */
  onImportMeta?: (meta: { displayName: string | null; tagline: string | null }) => void;
}

/**
 * Restore from your own ROUT export or move over from LinkStack. Everything
 * lands in the editor (and so in the private draft); publishing stays a
 * separate, deliberate step.
 */
export function ProfileImportCard({ blocks, onBlocksChange, onImportMeta }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ProfileImport | null>(null);
  const [withMeta, setWithMeta] = useState(true);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      toast.error(t("studio.import.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      const result = parseProfileImport(await file.text());
      if ("error" in result) toast.error(t(`studio.import.error.${result.error}`));
      else setPending(result);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const apply = (mode: "append" | "replace") => {
    if (!pending) return;
    const before = blocks;
    const { blocks: next, dropped } = mergeImportedBlocks(blocks, pending.blocks, mode);
    onBlocksChange(next);
    if (withMeta && onImportMeta && (pending.displayName || pending.tagline)) {
      onImportMeta({ displayName: pending.displayName, tagline: pending.tagline });
    }
    toast.success(t("studio.import.done", { count: next.length - (mode === "append" ? before.length : 0) }), {
      description: dropped > 0 ? t("studio.import.dropped", { count: dropped }) : undefined,
      action: { label: t("studio.links.undo"), onClick: () => onBlocksChange(before) },
    });
    setPending(null);
  };

  return (
    <details className="space-y-3 border-t border-border pt-4">
      <summary className="cursor-pointer text-sm font-medium">{t("studio.import.title")}</summary>
      <div className="space-y-3 pt-3">
        <p className="text-sm text-muted-foreground">{t("studio.import.help")}</p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={t("studio.import.choose")}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" className="gap-2" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
          {t("studio.import.choose")}
        </Button>
        {pending && (
          <div className="space-y-3 rounded-xl border border-border bg-background p-3" role="region" aria-label={t("studio.import.summaryLabel")}>
            <p className="text-sm font-medium">
              {t(pending.source === "rout" ? "studio.import.fromRout" : "studio.import.fromLinkstack")}
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>{t("studio.import.blocks", { count: pending.blocks.length })}</li>
              {pending.skipped > 0 && <li>{t("studio.import.skipped", { count: pending.skipped })}</li>}
              {pending.displayName && <li>{t("studio.import.name", { name: pending.displayName })}</li>}
            </ul>
            {onImportMeta && (pending.displayName || pending.tagline) && (
              <label className="flex items-center justify-between gap-3 text-xs">
                <span>{t("studio.import.withMeta")}</span>
                <Switch checked={withMeta} onCheckedChange={setWithMeta} aria-label={t("studio.import.withMeta")} />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => apply("append")}>{t("studio.import.append")}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => apply("replace")}>{t("studio.import.replace")}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>{t("studio.import.cancel")}</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("studio.import.draftNote")}</p>
          </div>
        )}
      </div>
    </details>
  );
}
