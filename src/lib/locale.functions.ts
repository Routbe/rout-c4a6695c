import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequest } from "@tanstack/react-start/server";
import { isLocale, type Locale } from "@/lib/i18n";

/**
 * Resolves the visitor's locale on the server so social crawlers — which never
 * run JavaScript — still receive the right OpenGraph card. Order: `/en/` style
 * path prefix, then the `rout_lang` cookie, then `Accept-Language`.
 */
export const getRequestLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    locale: Locale;
  }> => {
    try {
      const pathname = new URL(getRequest().url).pathname;
      const prefix = /^\/(nl|en|fr|de)(?:\/|$)/.exec(pathname)?.[1];
      if (isLocale(prefix)) return { locale: prefix };
    } catch {
      /* no request context (prerender) — fall through */
    }

    const cookie = getRequestHeader("cookie") ?? "";
    const match = /(?:^|;\s*)rout_lang=([^;]+)/.exec(cookie);
    const fromCookie = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (isLocale(fromCookie)) return { locale: fromCookie };

    const accept = (getRequestHeader("accept-language") ?? "").toLowerCase();
    for (const candidate of accept.split(",")) {
      const tag = candidate.trim().split(";")[0]?.slice(0, 2);
      if (tag === "nl" || tag === "fr" || tag === "de" || tag === "en") return { locale: tag };
    }
    return { locale: "en" };
  },
);
