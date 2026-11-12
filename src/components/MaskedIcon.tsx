import { cn } from "@/lib/utils";

/**
 * Renders an SVG/PNG brand mark as a CSS mask filled with `currentColor`.
 *
 * Brand assets ship their own brand colours; masking discards every pixel
 * colour and keeps only the shape, so third-party logos inherit the app's
 * monochrome text colour in both light and dark themes. Pass a bundled data
 * URI (see `@/lib/brand-marks`) rather than a vendor URL so the mask is
 * available on first paint and never flashes.
 */
export function MaskedIcon({
  src,
  className,
  title,
}: {
  src: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      aria-hidden
      data-masked-icon=""
      title={title}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
