import { cn } from "@/lib/utils";
import { BUNNY_PATH } from "@/lib/site";

/**
 * Flat ROUT brand loader.
 *
 * Replaces the generic grey skeleton blocks: an even surface with generous
 * padding and the centred ROUT rabbit, breathing softly. It fades out as the
 * real content fades in, so there is never an abrupt block-to-content jump.
 */
export function BrandLoader({
  className,
  label = "Laden…",
  size = 44,
}: {
  className?: string;
  label?: string;
  size?: number;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "absolute inset-0 flex items-center justify-center rounded-xl bg-muted/30 p-6 motion-safe:animate-fade-in",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="block shrink-0 bg-foreground/25 motion-safe:animate-pulse"
        style={{
          width: size,
          height: size,
          WebkitMaskImage: `url(${BUNNY_PATH})`,
          maskImage: `url(${BUNNY_PATH})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </div>
  );
}
