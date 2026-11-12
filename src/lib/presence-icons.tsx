import type { PresenceStatus } from "@/lib/avatar-decorations";

/** Minimal overlay glyphs for the status dot (stroke = currentColor). */
export function PresenceIcon({ status }: { status: PresenceStatus }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-[62%] w-[62%]", "aria-hidden": true };
  switch (status) {
    case "online": return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    case "idle": return <svg {...common} fill="currentColor" stroke="none"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
    case "dnd": return <svg {...common}><path d="M6 12h12" /></svg>;
    case "focus": return <svg {...common}><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>;
    case "offline": return <svg {...common}><circle cx="12" cy="12" r="6" /></svg>;
    default: return null;
  }
}
