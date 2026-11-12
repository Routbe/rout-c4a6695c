/**
 * The single place where the service worker is registered.
 *
 * Offline support must never leak into the Lovable editor preview or dev: a
 * cached app shell there keeps serving deleted chunks and white screens. The
 * worker is therefore only registered in a real production browsing context,
 * and in every refused context any stale registration for `/sw.js` is removed
 * again. `?sw=off` is the manual kill switch.
 */

const SW_URL = "/sw.js";
import { isAdminMode } from "./app-mode";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (isAdminMode() || window.location.hostname === "rout.dlp.li") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (
    new URLSearchParams(window.location.search).has("sw") &&
    new URLSearchParams(window.location.search).get("sw") === "off"
  )
    return true;

  return false;
}

async function unregisterAppWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(
    registrations
      .filter((registration: ServiceWorkerRegistration) => {
        const url = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? "";
        return url.endsWith(SW_URL);
      })
      .map((registration) => registration.unregister()),
  );
}

export function setupPwa(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (isRefusedContext()) {
    void unregisterAppWorker();
    return;
  }

  void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch((error) => {
    console.warn("[pwa] service worker registration failed", error);
  });
}
