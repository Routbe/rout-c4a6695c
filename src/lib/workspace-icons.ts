import {
  Briefcase, Building2, CalendarDays, Camera, Code2, Coffee, Dumbbell, GraduationCap, HandHeart, Heart,
  Leaf, Megaphone, Music, Palette, Rocket, ShoppingBag, Sparkles, Store, Trophy, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceCategory } from "./workspace-wizard";

/** Fixed icon set (one stroke style). Keys are stored in workspaces.icon. */
export const WORKSPACE_ICONS = {
  building: Building2, briefcase: Briefcase, store: Store, shop: ShoppingBag, palette: Palette,
  megaphone: Megaphone, code: Code2, camera: Camera, heart: Heart, "hand-heart": HandHeart,
  leaf: Leaf, calendar: CalendarDays, music: Music, trophy: Trophy, rocket: Rocket,
  sparkles: Sparkles, education: GraduationCap, coffee: Coffee, sport: Dumbbell, tools: Wrench,
} satisfies Record<string, LucideIcon>;

export type WorkspaceIconKey = keyof typeof WORKSPACE_ICONS;
export const WORKSPACE_ICON_KEYS = Object.keys(WORKSPACE_ICONS) as WorkspaceIconKey[];

export const CATEGORY_DEFAULT_ICON: Record<WorkspaceCategory, WorkspaceIconKey> = {
  business: "building",
  agency: "palette",
  nonprofit: "hand-heart",
  event: "calendar",
  project: "rocket",
};

export function isWorkspaceIconKey(v: unknown): v is WorkspaceIconKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WORKSPACE_ICONS, v);
}

/** Chosen icon wins; otherwise the category's icon; otherwise the building. */
export function resolveWorkspaceIcon(icon: string | null | undefined, category: string | null | undefined): WorkspaceIconKey {
  if (isWorkspaceIconKey(icon)) return icon;
  if (category && category in CATEGORY_DEFAULT_ICON) return CATEGORY_DEFAULT_ICON[category as WorkspaceCategory];
  return "building";
}
