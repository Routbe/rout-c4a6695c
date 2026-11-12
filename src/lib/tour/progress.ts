import { isTourId, type TourId } from "./definitions";

export const TOUR_STORAGE_KEY = "rout_completed_tours";
export const TOUR_START_EVENT = "rout:tour-start";

export function readCompletedTours(): TourId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOUR_STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isTourId) : [];
  } catch {
    return [];
  }
}

export function markTourDone(id: TourId): void {
  if (typeof window === "undefined") return;
  const next = [...new Set([...readCompletedTours(), id])];
  try { window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

/** Force-start a tour from anywhere (Cmd+K, help buttons). */
export function startTour(id: TourId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: { id } }));
}
