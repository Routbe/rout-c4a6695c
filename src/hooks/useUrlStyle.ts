import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getUrlStyle, saveUrlStyle } from "@/lib/url-style.functions";
import { DEFAULT_URL_STYLE, isUrlStyle, type UrlStyle } from "@/lib/profile-url";

/**
 * The member's preferred display shape for their profile URL. Purely cosmetic:
 * every shape resolves to the same profile, so a failed read simply falls back
 * to the default instead of blocking the UI.
 */
export function useUrlStyle() {
  const { user } = useAuth();
  const getUrlStyleFn = useServerFn(getUrlStyle);
  const saveUrlStyleFn = useServerFn(saveUrlStyle);
  const [style, setStyle] = useState<UrlStyle>(DEFAULT_URL_STYLE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { urlStyle } = await getUrlStyleFn();
        if (!alive) return;
        setStyle(isUrlStyle(urlStyle) ? urlStyle : DEFAULT_URL_STYLE);
      } catch {
        // Failed reads fall back to the default style instead of crashing.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, getUrlStyleFn]);

  const save = useCallback(
    async (next: UrlStyle) => {
      setStyle(next);
      if (!user) return { error: null };
      const result = await saveUrlStyleFn({ data: { style: next } });
      return { error: result.ok ? null : new Error(result.message ?? "save_failed") };
    },
    [user, saveUrlStyleFn],
  );

  return { style, setStyle, save, loading };
}
