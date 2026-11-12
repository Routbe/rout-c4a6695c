import { withStepUp } from "@/components/auth/StepUpDialog";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StepUpCodeField } from "./StepUpCodeField";
import { cancelMyDeletion, getMyDeletion, requestMyDeletion } from "@/lib/account-deletion.functions";
import { useI18n } from "@/lib/i18n";

/** Self-service deletion: e-mail code, then 7 days to change your mind, then a full purge. */
export function DeleteAccountPanel() {
  const { t, locale } = useI18n();
  const get = useServerFn(getMyDeletion);
  const request = useServerFn(requestMyDeletion);
  const cancel = useServerFn(cancelMyDeletion);
  const [state, setState] = useState<{ pending: boolean; purgeAfter?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await get());
    } catch {
      setState({ pending: false });
    }
  }, [get]);
  useEffect(() => void refresh(), [refresh]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await withStepUp(fn);
      toast.success(ok);
      setOpen(false);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ui.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (state?.pending) {
    return (
      <div className="space-y-2 rounded-xl border border-destructive/40 bg-background p-3">
        <p className="text-sm font-medium text-foreground">{t("deletion.pending")}</p>
        <p className="text-xs text-muted-foreground">
          {state.purgeAfter && t("deletion.date", { date: new Date(state.purgeAfter).toLocaleString(locale) })}
        </p>
        <Button variant="outline" disabled={busy} onClick={() => run(() => cancel(), t("deletion.cancelled"))}>
          {t("deletion.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t("deletion.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("deletion.description")}
          </p>
        </div>
        {!open && (
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {t("deletion.open")}
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          <StepUpCodeField purpose="delete_account" value={code} onChange={setCode} />
          <div className="flex gap-2">
            <Button variant="destructive" disabled={busy || code.length !== 6} onClick={() => run(() => request({ data: { code } }), t("deletion.scheduled"))}>
              {t("deletion.confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
