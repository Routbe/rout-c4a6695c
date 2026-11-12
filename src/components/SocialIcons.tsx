import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Monochrome brand marks not covered by lucide-react. */

export function BlueskyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      {/* Optical centring: the butterfly bbox sits ~1px high in a 24px box. */}
      <g transform="translate(0 1.05)">
        <path d="M5.77 3.4C8.35 5.34 11.12 9.26 12 11.37c.88-2.11 3.65-6.03 6.23-7.97C20.09 2 23 .95 23 4.27c0 .66-.38 5.57-.6 6.37-.78 2.77-3.6 3.48-6.11 3.05 4.39.75 5.5 3.22 3.09 5.7-4.58 4.7-6.58-1.18-7.09-2.69-.09-.27-.14-.4-.14-.29 0-.11-.05.02-.14.29-.51 1.51-2.51 7.39-7.09 2.69-2.41-2.48-1.3-4.95 3.09-5.7-2.51.43-5.33-.28-6.11-3.05C1.68 9.84 1.3 4.93 1.3 4.27c0-3.32 2.91-2.27 4.47-.87Z" />
      </g>
    </svg>
  );
}

export function MastodonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.668 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z" />
    </svg>
  );
}

/**
 * Eyou — official brand mark, inlined.
 *
 * Inlined rather than loaded as a remote <img> or CSS mask: only an inline
 * path can inherit `currentColor`, which is what keeps this mark visually
 * consistent with the other monochrome marks in the footer and social rows.
 * The geometry is the canonical brand path and must not be redrawn.
 */
export function EyouIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 113 113"
      fill="currentColor"
      aria-hidden
      className={cn("inline-block shrink-0", className)}
      {...props}
    >
      {/* Source art is 113x106; nudge down to sit centred in a square box. */}
      <g transform="translate(0 3.5)">
        <path d="M112.4 86.2L85.1 97.4C84.2 86.3 76.3 67.1 69.2 59.7C65.6 76.9 52.1 93.7 40.4 105.9L17.6 83.1C28.1 77 45.2 67.9 52.1 55.5C34.3 57.5 15.9 52.6 0 45.4L13 14.4C25.1 25 39 36.1 56.9 37.8C55 32.3 47.7 21.8 43.4 17.3L60.7 0C64.6 6.2 70.1 26.5 70.4 34.3C78.1 28.5 100.2 18.8 111.1 17.2V44.2C104.6 43.4 84.4 45.2 79 47.1C88.4 52.6 103.7 68.4 109.5 79.8C110.4 81.7 111.5 84.1 112.5 86.3L112.4 86.2Z" />
      </g>
    </svg>
  );
}
