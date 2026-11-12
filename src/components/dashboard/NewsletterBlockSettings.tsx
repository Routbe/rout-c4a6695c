import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { exportMySubscribers, getMySubscriberSummary } from "@/lib/newsletter.functions";

/**
 * Signup block settings: optional Brevo list, live counts and the owner-only
 * CSV download. Addresses are decrypted on the server for this download only.
 */
export function NewsletterBlockSettings({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const loadSummary = useServerFn(getMySubscriberSummary);
  const runExport = useServerFn(exportMySubscribers);
  const summary = useQuery({ queryKey: ["my-subscriber-summary"], queryFn: () => loadSummary(), staleTime: 30_000 });
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await runExport({ data: { confirmedOnly } });
      if (!res.ok) {
        toast.error(t(res.error === "rate_limited" ? "studio.signup.exportLimited" : "studio.signup.exportFailed"));
        return;
      }
      const blob = new Blob([`\uFEFF${res.csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("studio.signup.exported", { count: res.count }));
    } catch {
      toast.error(t("studio.signup.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  const s = summary.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([
          ["confirmed", s?.confirmed],
          ["pending", s?.pending],
          ["unsubscribed", s?.unsubscribed],
        ] as const).map(([key, n]) => (
          <div key={key} className="rounded-xl border border-border p-2 text-center">
            <p className="text-lg font-semibold tabular-nums">{n ?? "–"}</p>
            <p className="text-[10px] text-muted-foreground">{t(`studio.signup.${key}`)}</p>
          </div>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 text-xs">
        <span>{t("studio.signup.confirmedOnly")}</span>
        <Switch checked={confirmedOnly} onCheckedChange={setConfirmedOnly} aria-label={t("studio.signup.confirmedOnly")} />
      </label>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void download()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {t("studio.signup.download")}
      </Button>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {t("studio.signup.privacy")}
      </p>
      <label className="block space-y-1 text-[11px] text-muted-foreground">
        {t("studio.signup.brevoList")}
        <Input
          inputMode="numeric"
          className="input-field h-9 rounded-xl"
          value={value}
          maxLength={9}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="12"
        />
      </label>
    </div>
  );
}
