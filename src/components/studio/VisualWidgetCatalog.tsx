import { useTranslation } from "react-i18next";
import { CalendarHeart, Clock, CloudSun, Image, Map, MessageSquareQuote, Music2, Type, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VISUAL_WIDGET_KINDS, type VisualWidgetKind } from "@/lib/profile-widgets";

export const VISUAL_WIDGET_ICON: Record<VisualWidgetKind, LucideIcon> = {
  wg_weather: CloudSun,
  wg_clock: Clock,
  wg_map: Map,
  wg_post: MessageSquareQuote,
  wg_photo: Image,
  wg_music: Music2,
  wg_birthday: CalendarHeart,
  wg_text: Type,
  wg_video: Video,
};

/**
 * "Add widget" catalog: only the nine visual widgets, separate from the
 * social buttons and the component library.
 */
export function VisualWidgetCatalog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (kind: VisualWidgetKind) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("studio.vw.catalogTitle")}</DialogTitle>
          <DialogDescription>{t("studio.vw.catalogHelp")}</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {VISUAL_WIDGET_KINDS.map((kind) => {
            const Icon = VISUAL_WIDGET_ICON[kind];
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => { onPick(kind); onClose(); }}
                  className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-foreground/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{t(`studio.vw.kind.${kind}`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`studio.vw.desc.${kind}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
