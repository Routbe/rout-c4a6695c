import { useId } from "react";
import { siInstagram, siSnapchat, siWhatsapp } from "@/utils/simple-icon-paths";
import { cn } from "@/lib/utils";

export type AppBrand = "snapchat" | "instagram" | "whatsapp";

/**
 * Official app-icon tiles. Brand colours are fixed by each brand's guidelines
 * (the only hard-coded colours allowed), paths come from simple-icons.
 */
export function AppBrandTile({ brand, className }: { brand: AppBrand; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const base = cn("block size-9 shrink-0 overflow-hidden rounded-[28%]", className);
  if (brand === "snapchat") {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden>
        <rect width="24" height="24" fill="#FFFC00" />
        <g transform="translate(4.2 4.2) scale(0.65)">
          <path d={siSnapchat.path} fill="#FFFFFF" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }
  if (brand === "instagram") {
    return (
      <svg viewBox="0 0 24 24" className={base} aria-hidden>
        <defs>
          <radialGradient id={`ig-${gid}`} cx="0.3" cy="1.07" r="1.3">
            <stop offset="0" stopColor="#FDF497" />
            <stop offset="0.05" stopColor="#FDF497" />
            <stop offset="0.45" stopColor="#FD5949" />
            <stop offset="0.6" stopColor="#D6249F" />
            <stop offset="0.9" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <rect width="24" height="24" fill={`url(#ig-${gid})`} />
        <g transform="translate(5 5) scale(0.5833)">
          <path d={siInstagram.path} fill="#FFFFFF" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={base} aria-hidden>
      <rect width="24" height="24" fill="#25D366" />
      <g transform="translate(4.5 4.5) scale(0.625)">
        <path d={siWhatsapp.path} fill="#FFFFFF" />
      </g>
    </svg>
  );
}
