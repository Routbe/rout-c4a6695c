import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CircleHelp } from "lucide-react";
import { AnchoredTour } from "./AnchoredTour";
import { getFirstUseTour, completeFirstUseTour } from "@/lib/first-use-tour.functions";

export function FirstUseTour({ area, userId }: { area: "studio" | "dashboard"; userId: string }) {
  const { t } = useI18n();
  const get = useServerFn(getFirstUseTour);
  const complete = useServerFn(completeFirstUseTour);
  const [open, setOpen] = useState(false);
  const steps = area === "studio" ? ["pages", "content", "design", "publish"] : ["overview", "qrs", "links", "files"];
  useEffect(() => {
    let active = true;
    void get({ data: { area } }).then(result => { if (active && !result.seen) setOpen(true); }).catch(() => {});
    return () => { active = false; };
  }, [area, userId, get]);
  const finish = useCallback(() => { setOpen(false); void complete({ data: { area } }).catch(() => {}); }, [area, complete]);
  return <>
    <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("studio.tour.restart")} title={t("studio.tour.restart")} className="absolute right-0 top-0 h-6 w-6 rounded-full text-muted-foreground/60 hover:text-foreground"><CircleHelp className="h-3.5 w-3.5" /></Button>
    {open && <AnchoredTour onDone={finish} labels={{ skip: t("studio.tour.skip"), back: t("studio.tour.back"), next: t("studio.tour.next"), done: t("studio.tour.done") }} steps={steps.map(id => ({
      title: t(`studio.tour.${area}.${id}.title`), body: t(`studio.tour.${area}.${id}.body`),
      target: `[data-tour="${area === "dashboard" ? `dashboard-${id}` : id === "content" ? "studio-tab-links" : id === "design" ? "studio-tab-design" : `studio-${id}`}"]`,
      activate: area === "dashboard" || id === "content" || id === "design",
    }))} />}
  </>;
}