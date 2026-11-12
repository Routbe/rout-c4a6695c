import { cn } from "@/lib/utils";

export type StudioSymbol = "profile" | "content" | "live" | "favorites" | "avatar" | "typography" | "footer" | "background" | "badges" | "questions" | "guestbook" | "settings" | "design" | "analytics" | "identity" | "domain" | "bluesky" | "layers";
const drawings: Record<StudioSymbol, string> = {
  profile: "M8 10a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21c0-5 16-5 16 0",
  content: "M8 4H4v16h16v-4M10 14l8-8M14 4h6v6M8 10H6m2 4H6",
  live: "M3 12h4l3-7 4 14 3-7h4",
  favorites: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  avatar: "M3 5h18v16H3ZM8 11a4 4 0 1 0 8 0 4 4 0 1 0-8 0M5 21c1-6 13-6 14 0M7 3v4m10-4v4",
  typography: "M3 18 8 5l5 13M5 13h6m4-2h6m-3 0v10m-3-1h6",
  footer: "M3 4h18v16H3Zm0 11h18m-13 5v-5m8 5v-5",
  background: "M3 4h18v16H3Zm0 12 5-5 5 5 3-3 5 5M15 8h.01",
  badges: "m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7Zm-4 9 3 3 5-6",
  questions: "M9 9a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3h.01M3 3h18v17H8l-5 3Z",
  guestbook: "M3 5c3-2 6-2 9 0 3-2 6-2 9 0v15c-3-2-6-2-9 0-3-2-6-2-9 0Zm9 0v15M6 9h3m-3 4h3m6-4h3m-3 4h3",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  design: "M4 3h16v18H4Zm0 6h16M8 13h3v4H8Zm7-1v6m-2-3h4",
  analytics: "M3 3v18h18M7 17v-5m5 5V8m5 9V4M5 8l5-3 5 1 5-4",
  domain: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  bluesky: "M12 11C10 7 6 4 4 5s0 7 3 8c-3 1-3 5 0 6s4-3 5-6c1 3 2 7 5 6s3-5 0-6c3-1 5-7 3-8s-6 2-8 6Z",
  layers: "m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  identity: "M3 5h18v14H3ZM6 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 16c0-3 6-3 6 0m3-7h4m-4 4h4",
};

/** Shared, hand-drawn line symbols for Studio folders (never emoji). */
export function StudioSectionIcon({ kind, className }: { kind: StudioSymbol; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5 shrink-0 text-muted-foreground", className)}><path d={drawings[kind]} /></svg>;
}