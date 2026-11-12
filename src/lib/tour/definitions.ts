/**
 * Tour content is keys only: titles and bodies resolve through i18n as
 * `tourEngine.<tour>.<step>.title|body`. Steps name a DOM target via
 * `data-tour` and optionally the user action that advances them.
 */
export type TourId = "studio" | "commandCenter" | "agenda" | "identity";

export type AdvanceOn =
  | { kind: "click" }
  | { kind: "input"; valid: "url" | "nonEmpty" };

export interface TourStepDef {
  id: string;
  target: string;
  /** Select a tab before spotlighting it. */
  activate?: boolean;
  advanceOn?: AdvanceOn;
}

export interface TourDef {
  id: TourId;
  /** Path prefix the tour belongs to; leaving it aborts the tour. */
  path: string;
  steps: TourStepDef[];
}

export const TOURS: Record<TourId, TourDef> = {
  studio: {
    id: "studio",
    path: "/studio",
    steps: [
      { id: "mode", target: "studio-mode" },
      { id: "pages", target: "studio-pages" },
      { id: "content", target: "studio-tab-links", advanceOn: { kind: "click" } },
      { id: "design", target: "studio-tab-design", advanceOn: { kind: "click" } },
      { id: "buttonStyle", target: "studio-button-style" },
      { id: "publish", target: "studio-publish" },
    ],
  },
  commandCenter: {
    id: "commandCenter",
    path: "/dashboard",
    steps: [
      { id: "qr", target: "cc-qr-input", advanceOn: { kind: "input", valid: "url" } },
      { id: "agenda", target: "cc-agenda" },
      { id: "customize", target: "cc-customize" },
      { id: "studio", target: "cc-studio" },
    ],
  },
  agenda: {
    id: "agenda",
    path: "/agenda",
    steps: [
      { id: "title", target: "agenda-title", advanceOn: { kind: "input", valid: "nonEmpty" } },
      { id: "mode", target: "agenda-mode" },
      { id: "create", target: "agenda-create", advanceOn: { kind: "click" } },
      { id: "list", target: "agenda-list" },
    ],
  },
  identity: {
    id: "identity",
    path: "/dashboard/identity",
    steps: [
      { id: "relays", target: "identity-relays" },
      { id: "email", target: "identity-email" },
      { id: "push", target: "identity-push" },
    ],
  },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function isTourId(v: unknown): v is TourId {
  return typeof v === "string" && v in TOURS;
}

export function stepKey(tour: TourId, step: string, part: "title" | "body"): string {
  return `tourEngine.${tour}.${step}.${part}`;
}

/** Accepts what a person would paste: a full http(s) URL or a bare domain. */
export function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function tourForPath(pathname: string): TourId | null {
  if (pathname.startsWith("/dashboard/identity")) return "identity";
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "commandCenter";
  if (pathname.startsWith("/agenda")) return "agenda";
  if (pathname === "/studio" || pathname === "/studio/") return "studio";
  return null;
}
