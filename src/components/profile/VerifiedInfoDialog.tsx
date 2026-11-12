import { BadgeCheck, ShieldQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Opens from the verification indicator in the profile header and states the
 * official registration date — the anti-impersonation proof of a handle.
 */
export function VerifiedInfoDialog({
  open,
  onClose,
  username,
  createdAt,
  verified,
  earlyBeliever,
}: {
  open: boolean;
  onClose: () => void;
  username: string | null;
  createdAt?: string | null;
  verified: boolean;
  earlyBeliever: boolean;
}) {
  const { t, locale } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {verified ? (
              <BadgeCheck className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldQuestion className="h-5 w-5 text-muted-foreground" aria-hidden />
            )}
            {verified
              ? earlyBeliever
                ? t("verifyInfo.titleEarly")
                : t("verifyInfo.title")
              : t("verifyInfo.titleUnverified")}
          </DialogTitle>
          <DialogDescription>
            {verified ? t("verifyInfo.body") : t("verifyInfo.bodyUnverified")}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          {username ? (
            <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("verifyInfo.handle")}
              </dt>
              <dd className="font-medium">@{username}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("verifyInfo.registered")}
            </dt>
            <dd className="font-medium tabular-nums">{formatDate(createdAt, locale)}</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
