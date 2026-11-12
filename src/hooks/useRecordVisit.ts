import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordProfileVisit } from "@/lib/visits.functions";
import type { VisitSpace } from "@/lib/visits.server";

/**
 * Registreert één bezoek aan een publiek profiel (root of alias).
 * Draait alleen in de browser en faalt stil — statistiek mag nooit een
 * profielpagina breken.
 */
export function useRecordVisit(handle: string | null | undefined, space: VisitSpace) {
  const record = useServerFn(recordProfileVisit);

  useEffect(() => {
    if (!handle) return;
    const locale =
      document.documentElement.lang || navigator.language?.slice(0, 5).toLowerCase() || null;
    void record({
      data: {
        handle,
        space,
        path: window.location.pathname,
        locale,
      },
    }).catch(() => undefined);
  }, [handle, space, record]);
}
