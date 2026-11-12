import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getMyMutes, liftMyMute } from "@/lib/questions.functions";
import { Button } from "@/components/ui/button";

/**
 * Muted senders, shown as the member's own mute actions: when they muted, and
 * the message they muted. Nobody is named, and two mutes that happen to hit the
 * same person stay two entries, so the list can never link messages together.
 */
export function QaMutedList() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const fetchMutes = useServerFn(getMyMutes);
  const lift = useServerFn(liftMyMute);
  const q = useQuery({ queryKey: ["my-qa-mutes"], queryFn: () => fetchMutes(), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const mutes = q.data?.mutes ?? [];

  const onLift = async (id: string) => {
    setBusy(id);
    try {
      const { ok } = await lift({ data: { id } });
      if (!ok) throw new Error("lift_failed");
      toast.success(t("pages.qa.mutes.lifted"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-qa-mutes"] }),
        qc.invalidateQueries({ queryKey: ["my-questions"] }),
      ]);
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="rounded-xl border border-border p-3" onToggle={(e) => (e.currentTarget.open ? void q.refetch() : undefined)}>
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
        <VolumeX className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 font-medium">{t("pages.qa.mutes.title")}</span>
        {mutes.length > 0 && <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{mutes.length}</span>}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">{t("pages.qa.mutes.help")}</p>
        {q.isLoading ? (
          <div className="h-12 animate-pulse rounded-lg bg-muted" aria-hidden />
        ) : q.isError && !q.data ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            <span>{t("pages.qa.loadFailed")}</span>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("pages.qa.retry")}</Button>
          </div>
        ) : mutes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">{t("pages.qa.mutes.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {mutes.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.excerpt ? `“${m.excerpt}”` : t("pages.qa.mutes.noMessage")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("pages.qa.mutes.since", { date: new Date(m.mutedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}
                    {m.space && ` · ${t(`pages.qa.inbox.space.${m.space}`)}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={busy === m.id} onClick={() => void onLift(m.id)}>
                  <Volume2 className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.mutes.lift")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
