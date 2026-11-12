/**
 * Header menu destinations. Signed-in members go straight to the working tool;
 * signed-out visitors land on the product page that explains it, never on a
 * sign-in wall. Discover slugs come from topics.ts so links stay in one place.
 */
import type { TopicSlug } from "./topics";

const discover = (slug: TopicSlug) => `/discover/${slug}`;

export const MENU_TARGETS = {
  generator: { tool: "/qr", about: discover("qr-studio") },
  studio: { tool: "/studio", about: discover("profiles") },
  agenda: { tool: "/agenda", about: discover("bookings") },
  batch: { tool: "/batch", about: "/product/batch-engine" },
  links: { tool: "/dashboard/routes", about: discover("links") },
  domains: { tool: "/product/custom-domains", about: "/product/custom-domains" },
  api: { tool: "/console", about: discover("developers") },
  docs: { tool: "/self-hosting", about: "/self-hosting" },
} as const;

export type MenuKey = keyof typeof MENU_TARGETS;

export function menuTarget(key: MenuKey, signedIn: boolean): string {
  const t = MENU_TARGETS[key];
  return signedIn ? t.tool : t.about;
}
