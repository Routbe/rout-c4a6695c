import { Plug } from "lucide-react";
import * as icons from "simple-icons";

const CUSTOM: Record<string, { path: string; hex: string }> = {
  // Official Xbox sphere mark.
  xbox: {
    hex: "107C10",
    path: "M4.102 21.033A11.947 11.947 0 0 0 12 24a11.96 11.96 0 0 0 7.902-2.967c1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912A11.942 11.942 0 0 0 24 12.004a11.95 11.95 0 0 0-3.57-8.536s-.027-.022-.082-.042a.876.876 0 0 0-.281-.045c-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042A11.956 11.956 0 0 0 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245a.807.807 0 0 0-.281.046zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z",
  },
  linkedin: {
    hex: "0A66C2",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  wsocial: {
    hex: "1E66F5",
    path: "M2 4h3.2l2.6 11.2L10.6 4h2.8l2.8 11.2L18.8 4H22l-4.3 16h-3l-2.7-10.6L9.3 20h-3z",
  },
};

/** Logos shipped as local files (never hotlinked). */
const LOCAL: Record<string, string> = { wsocial: "/icons/wsocial.png" };

export function BrandIcon({ icon, className = "h-6 w-6" }: { icon: string | null; className?: string }) {
  const local = icon?.startsWith("custom:") ? LOCAL[icon.slice(7)] : undefined;
  if (local) return <img src={local} alt="" aria-hidden className={`${className} rounded-[22%] object-contain`} />;
  const si = !icon
    ? null
    : icon.startsWith("custom:")
      ? CUSTOM[icon.slice(7)]
      : (icons as unknown as Record<string, { path: string; hex: string } | undefined>)[icon];
  if (!si) return <Plug className={className} aria-hidden />;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden style={{ fill: `#${si.hex}` }}>
      <path d={si.path} />
    </svg>
  );
}
