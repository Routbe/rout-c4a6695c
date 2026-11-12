import { cn } from "@/lib/utils";

/**
 * Same-origin copy of the bunny badge. The QR renderer draws the centre logo
 * onto a canvas, so a cross-origin URL (rout.be) is blocked by CORS and wipes
 * the preview — this local asset always loads.
 */
const bunnySrc = "/img/logo.png";

/**
 * Theme-aware vector mark. `/logo.svg` is a clean, transparent outline of the
 * ROUT bunny; it is painted through a CSS mask so it inherits `currentColor`
 * (white in dark mode, near-black in light mode).
 */
const logoSrc = "/logo.svg";

interface RoutLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

/**
 * ROUT brand lockup — official rout.be badge mark + monospace wordmark.
 * The mark is the canonical colour logo (public/img/logo.png), mirrored from
 * https://rout.be/img/logo.png, so header, footer, favicon and social cards
 * all resolve to the same asset.
 */
export function RoutLogo({ className, size = 28, showWordmark = true }: RoutLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 leading-none", className)}>
      <span
        role="img"
        aria-label="ROUT"
        className="block shrink-0 bg-current align-middle text-foreground"
        style={{
          width: size,
          height: size,
          maskImage: `url(${logoSrc})`,
          WebkitMaskImage: `url(${logoSrc})`,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskSize: "contain",
          WebkitMaskSize: "contain",
        }}
      />
      {showWordmark && (
        <span
          className="font-brand relative top-px font-bold leading-none tracking-[0.16em] text-foreground"
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          ROUT
        </span>
      )}
    </span>
  );
}

// QR codes rasterise the mark onto a canvas, where `currentColor` has no
// context — those keep using the full-colour raster badge.
export { logoSrc as routLogoSrc, bunnySrc as routBunnySrc };
