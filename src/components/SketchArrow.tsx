import { cn } from "@/lib/utils";

interface SketchArrowProps {
  className?: string;
  /** Mirrors the arrow horizontally. */
  flip?: boolean;
}

/**
 * A small hand-drawn arrow used to point at UI elements for first-time users.
 * Inherits the current text color so it stays legible in light and dark mode.
 */
export function SketchArrow({ className, flip }: SketchArrowProps) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      aria-hidden="true"
      className={cn("h-8 w-12 text-muted-foreground", flip && "scale-x-[-1]", className)}
    >
      <path
        d="M2 6c9.5 12.5 21.5 21 36 24.5 6 1.4 12 2 18 1.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        style={{ strokeDasharray: "0.1 0" }}
      />
      <path
        d="M47 25.5c3.2 2.6 6 4.6 9 6.6-3.4 1.4-6.3 3.2-9.4 5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
