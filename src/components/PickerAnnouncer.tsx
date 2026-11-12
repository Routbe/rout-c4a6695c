import { cn } from "@/lib/utils";

/**
 * Screen-reader-only live region for a picker.
 *
 * Radio semantics announce focus moves; this region additionally announces the
 * resulting selection ("Midnight theme selected") whenever it changes.
 */
export function PickerAnnouncer({ message, className }: { message: string; className?: string }) {
  return (
    <p aria-live="polite" aria-atomic="true" className={cn("sr-only", className)}>
      {message}
    </p>
  );
}
