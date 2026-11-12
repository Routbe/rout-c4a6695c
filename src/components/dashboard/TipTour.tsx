import { useTranslation } from "react-i18next";
import { AnchoredTour, type TourStep } from "@/components/onboarding/AnchoredTour";

const TARGETS = ["tip-status", "tip-bank", "tip-amounts", "tip-photos", "tip-save"];

export const TIP_TOUR_KEY = "rout_tour_tip_done";

/** Rondleiding bij de eerste activatie van de steunpagina, verankerd aan de echte velden. */
export function TipTour({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const steps: TourStep[] = TARGETS.map((target, i) => ({
    target: `[data-tour="${target}"]`,
    title: t(`studio.tipTour.s${i + 1}t`),
    body: t(`studio.tipTour.s${i + 1}b`),
  }));
  const finish = () => {
    try {
      window.localStorage.setItem(TIP_TOUR_KEY, "1");
    } catch {
      /* geen opslag: de tour komt dan nog eens terug */
    }
    onDone();
  };
  return <AnchoredTour steps={steps} onDone={finish} labels={{ skip: t("studio.tipTour.skip"), back: t("studio.tipTour.back"), next: t("studio.tipTour.next"), done: t("studio.tipTour.done") }} />;
}
