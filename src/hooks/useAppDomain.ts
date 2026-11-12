import { useSyncExternalStore } from "react";
import { PRIMARY_DOMAIN, domainFromHost, type AppDomain } from "@/lib/app-domains";

const subscribe = () => () => {};

/**
 * The brand currently being served (`rout.be` or `dlp.li`).
 *
 * During SSR the server snapshot is the primary domain, which keeps markup
 * stable; the client snapshot reads the real host after hydration.
 */
export function useAppDomain(): AppDomain {
  return useSyncExternalStore(
    subscribe,
    () => domainFromHost(window.location.host),
    () => PRIMARY_DOMAIN,
  );
}
