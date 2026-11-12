import { getPublicEventType, getPublicSlots } from "./booking.functions";
import type { BookingInitial } from "@/components/imported-pages/BookPublic";

/**
 * Route-loader prefetch for the guest page: type and free times in one round
 * (during SSR on the server itself), so the page arrives complete. A slot
 * hiccup degrades to an empty list that the page refetches on its own.
 */
export async function loadBookingInitial(id: string): Promise<BookingInitial> {
  const [type, slots] = await Promise.all([
    getPublicEventType({ data: { id } }),
    getPublicSlots({ data: { id, holdId: null } }).catch(() => ({ slots: [] as string[] })),
  ]);
  return { type, slots: slots.slots, at: Date.now() };
}
