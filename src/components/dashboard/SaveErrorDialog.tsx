import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendSaveErrorReport } from "@/lib/error-report.functions";
import type { SaveErrorCode, SaveErrorInfo } from "@/lib/save-errors";
import { i18n as trI18n } from "@/lib/i18n";

const EXPLAIN: Record<SaveErrorCode, string> = {
  session_expired: "save.explain.session_expired",
  validation_failed: "save.explain.validation_failed",
  db_unavailable: "save.explain.db_unavailable",
  db_timeout: "save.explain.db_timeout",
  conflict: "save.explain.conflict",
  network: "save.explain.network",
  unknown: "save.explain.unknown",
};

export function SaveErrorDialog({
  error,
  open,
  onOpenChange,
  onRetry,
  endpoint,
}: {
  error: SaveErrorInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  endpoint: string;
}) {
  const report = useServerFn(sendSaveErrorReport);
  const [showTech, setShowTech] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await report({ data: { ...error, endpoint } });
      if (res.sent) toast.success(trI18n.t("ui.31075ba446"));
      else if (res.reason === "rate_limited") toast.info(trI18n.t("ui.1a3d3f9a44"));
      else toast.error(trI18n.t("ui.937fa59b6a"));
    } catch {
      toast.error(trI18n.t("ui.937fa59b6a"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{trI18n.t("ui.5afbdac0e2")}</DialogTitle>
          <DialogDescription>{trI18n.t(EXPLAIN[error.code])}</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground"
          aria-expanded={showTech}
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showTech ? "rotate-180" : ""}`} aria-hidden />
          {trI18n.t("ui.c6f9706b9d")}
        </button>
        {showTech && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px]">
            <dt className="text-muted-foreground">Code</dt><dd>{error.code}</dd>
            <dt className="text-muted-foreground">HTTP</dt><dd>{error.status || trI18n.t("save.noConnection")}</dd>
            <dt className="text-muted-foreground">{trI18n.t("ui.93d88461b0")}</dt><dd>{new Date(error.at).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Detail</dt><dd className="break-all">{error.detail}</dd>
          </dl>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => { onOpenChange(false); onRetry(); }}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {trI18n.t("ui.b8caba0604")}
          </Button>
          <Button variant="outline" className="flex-1" disabled={sending} onClick={() => void send()}>
            <Mail className="h-4 w-4" aria-hidden /> {trI18n.t("ui.1493dcbf24")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
