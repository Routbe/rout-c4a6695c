import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/useAuth";

/**
 * Role-based UI gate. The answer is resolved once per session and cached, so
 * every admin-only menu item, button and shortcut can ask for it cheaply.
 * The cache is keyed on the user id and cleared when the user changes.
 */
let cache: { userId: string; value: boolean } | null = null;
let inflight: { userId: string; promise: Promise<boolean> } | null = null;

async function resolveIsAdmin(userId: string): Promise<boolean> {
  if (cache?.userId === userId) return cache.value;
  if (inflight?.userId === userId) return inflight.promise;

  const promise = (async () => {
    try {
      const res = await amIAdmin({});
      cache = { userId, value: res.isAdmin };
      return res.isAdmin;
    } catch {
      // Don't cache a failed check: a flaky call must not lock a real admin out for the session.
      return false;
    } finally {
      inflight = null;
    }
  })();

  inflight = { userId, promise };
  return promise;
}

/** Forget the cached role — call after sign-out or a role change. */
export function clearAdminRoleCache() {
  cache = null;
  inflight = null;
}

export function useIsAdmin() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean>(() =>
    user && cache?.userId === user.id ? cache.value : false,
  );
  const [checking, setChecking] = useState<boolean>(Boolean(user) && cache === null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      clearAdminRoleCache();
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    setChecking(cache?.userId !== user.id);
    void resolveIsAdmin(user.id).then((value) => {
      if (cancelled) return;
      setIsAdmin(value);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isAdmin, checking: checking || loading };
}
