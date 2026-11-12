import { useEffect, useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { getAccountStatus, setMyAccountStatus } from "@/lib/account-status.functions";

/** Tab 4 — self-service pause. Signing in later lifts the freeze automatically. */
export function FreezeAccountPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAccountStatus()
      .then((r) => setStatus(r.status))
      .catch(() => undefined);
  }, []);

  const toggle = async (next: "active" | "frozen") => {
    if (next === "frozen" && !window.confirm(t("freeze_account.confirm"))) return;
    setBusy(true);
    try {
      const result = await setMyAccountStatus({ data: { status: next } });
      setStatus(result.status);
      toast.success(next === "frozen" ? t("freeze_account.frozen") : t("freeze_account.resume"));
    } catch {
      toast.error(t("merge_account.error"));
    } finally {
      setBusy(false);
    }
  };

  const frozen = status === "frozen";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <PauseCircle className="h-4 w-4" /> {t("freeze_account.title")}
        </h2>
        {frozen ? <Badge variant="outline">{t("freeze_account.frozen")}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">{t("freeze_account.body")}</p>
      <Button
        variant="outline"
        disabled={busy}
        className="h-11 w-full gap-1.5 sm:w-auto"
        onClick={() => toggle(frozen ? "active" : "frozen")}
      >
        {frozen ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
        {frozen ? t("freeze_account.resume") : t("freeze_account.action")}
      </Button>
    </section>
  );
}
