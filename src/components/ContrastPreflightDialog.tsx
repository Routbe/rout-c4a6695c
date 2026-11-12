import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Preflight gate: shown when a user tries to export a code whose contrast is
 * under the WCAG AA safe threshold (4.5:1) for camera decoding.
 */
export function ContrastPreflightDialog({
  open,
  onOpenChange,
  ratio,
  onFixAndDownload,
  onDownloadAnyway,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ratio: number;
  onFixAndDownload: () => void;
  onDownloadAnyway: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl" data-testid="contrast-preflight">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
            {t("contrastDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("contrastDialog.description", { ratio: ratio.toFixed(2) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            data-testid="contrast-continue"
            onClick={onDownloadAnyway}
            className="min-h-11 rounded-xl"
          >
            {t("contrastDialog.continue")}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="contrast-autofix"
            onClick={onFixAndDownload}
            className="min-h-11 rounded-xl"
          >
            {t("contrastDialog.fix")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
