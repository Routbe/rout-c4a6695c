import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccount } from "@/lib/account.functions";
import { useAuth } from "@/hooks/useAuth";

/** Signed-in user's own public username; undefined while loading, null when none is claimed. */
export function useMyHandle(): string | null | undefined {
  const { user } = useAuth();
  const loadAccount = useServerFn(getMyAccount);
  const [handle, setHandle] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadAccount()
      .then((data) => { if (!cancelled) setHandle(data?.username ?? null); })
      .catch(() => { if (!cancelled) setHandle(null); });
    return () => { cancelled = true; };
  }, [user, loadAccount]);
  return handle;
}
