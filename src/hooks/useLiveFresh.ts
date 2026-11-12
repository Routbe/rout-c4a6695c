import { useEffect, useState } from "react";
import { LIVE_DATA_MAX_AGE_MS, isLiveDataFresh } from "@/lib/live-presence-rules";

/** True while a live widget's last successful update is recent; re-renders the moment it expires. */
export function useLiveFresh(provider: string, updatedAt: number | null | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const max = LIVE_DATA_MAX_AGE_MS[provider];
    if (max === undefined || !updatedAt) return;
    const wait = updatedAt + max - Date.now() + 50;
    if (wait <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), wait);
    const onVisible = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [provider, updatedAt]);
  return isLiveDataFresh(provider, updatedAt, now);
}
