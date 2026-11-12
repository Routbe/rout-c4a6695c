import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lightbulb, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExportRiskReport } from "@/lib/scanability";
import { i18n as trI18n } from "@/lib/i18n";

interface ExportWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: ExportRiskReport | null;
  /** Close the modal and let the user keep editing. */
  onFix: () => void;
  /** Ignore the warning and download anyway. */
  onDownloadAnyway: () => void;
}

export function ExportWarningDialog({
  open,
  onOpenChange,
  risk,
  onFix,
  onDownloadAnyway,
}: ExportWarningDialogProps) {
  const issues = risk?.issues ?? [];
  const critical = issues.some((i) => i.severity === "critical");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                critical ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
              )}
            >
              {critical ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </span>
            {critical ? "This code may not scan" : "Scan quality warning"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            We checked your design before exporting and found{" "}
            {issues.length === 1 ? "one issue" : `${issues.length} issues`} that could stop people
            from scanning it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-3 max-h-[45vh] overflow-y-auto">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className={cn(
                "rounded-2xl border p-3 space-y-1.5",
                issue.severity === "critical"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-card/60",
              )}
            >
              <p className="text-sm font-medium text-foreground">{issue.title}</p>
              <p className="text-xs text-muted-foreground">{issue.detail}</p>
              <p className="flex items-start gap-1.5 text-xs text-foreground">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>{issue.recommendation}</span>
              </p>
            </li>
          ))}
        </ul>

        {risk && (
          <p className="text-[11px] text-muted-foreground">
            Contrast {risk.report.ratio.toFixed(1)}:1 · {risk.report.length} characters ·
            recommended minimum print size {risk.report.minPrintMm} mm
          </p>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onDownloadAnyway}>
            {trI18n.t("ui.42859f749a")}
          </Button>
          <Button onClick={onFix}>{trI18n.t("ui.f7c650b354")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
