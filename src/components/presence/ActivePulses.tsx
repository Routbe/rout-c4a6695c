import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMyPulse, listMyPulses } from "@/lib/ephemeral.functions";
import { presenceKey } from "@/lib/presence";
import { useI18n } from "@/lib/i18n";

function remaining(iso: string, locale: string): string {
  const hours = Math.max(0, (Date.parse(iso) - Date.now()) / 3_600_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return hours < 1 ? rtf.format(Math.max(1, Math.round(hours * 60)), "minute") : rtf.format(Math.round(hours), "hour");
}

/** Owner's active pulses with "end now"; reads only the signed-in member's own rows. */
export function ActivePulses({ handle }: { handle: string | null }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(listMyPulses);
  const remove = useServerFn(deleteMyPulse);
  const q = useQuery({ queryKey: ["my-pulses"], queryFn: () => list(), retry: false, staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("presence.loading")} />;
  if (q.isError) return <p className="text-xs text-muted-foreground">{t("presence.listUnavailable")}</p>;
  const pulses = q.data?.pulses ?? [];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t("presence.active", { count: pulses.length })}</p>
      {pulses.length === 0 ? <p className="text-xs text-muted-foreground">{t("presence.noneActive")}</p> : pulses.map((p) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
          {p.statusType === "omni_drop" && <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 flex-1 truncate text-sm">{p.text ?? t("presence.spotlight")}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{p.space === "alias" ? "Alias · " : ""}{t("presence.expires", { when: remaining(p.expiresAt, locale) })}</span>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={busy === p.id} aria-label={t("presence.end")}
            onClick={async () => {
              setBusy(p.id);
              try {
                await remove({ data: { id: p.id } });
                await qc.invalidateQueries({ queryKey: ["my-pulses"] });
                if (handle) await qc.invalidateQueries({ queryKey: presenceKey(p.space, handle) });
                toast.success(t("presence.ended"));
              } catch { toast.error(t("presence.endFailed")); } finally { setBusy(null); }
            }}>
            {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ))}
    </div>
  );
}
