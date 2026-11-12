import { BRAND_MARK_URLS } from "@/lib/site";

/**
 * Third-party brand marks, consumed as CSS mask images so the shape inherits
 * `currentColor`.
 *
 * These are NEVER imported through Vite — bundled asset imports get rewritten
 * to a temporary preview host, which breaks production URLs. Every mark
 * resolves to a hardcoded absolute production URL defined in `@/lib/site`.
 */
export const BRAND_MARKS = {
  eyou: BRAND_MARK_URLS.eyou,
  mastodon: BRAND_MARK_URLS.mastodon,
  keycloak: BRAND_MARK_URLS.keycloak,
} as const;
