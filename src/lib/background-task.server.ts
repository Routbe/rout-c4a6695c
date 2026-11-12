import { currentRequest } from "@/lib/request-context";

type BackgroundRequest = Request & {
  waitUntil?: (task: Promise<unknown>) => void;
  runtime?: { cloudflare?: { context: { waitUntil(task: Promise<unknown>): void } } };
};

/** Register against the current request, never a shared/global Worker context. */
export function registerBackgroundTask(task: Promise<unknown>): boolean {
  try {
    const request = currentRequest() as BackgroundRequest;
    if (request.waitUntil) {
      request.waitUntil(task);
      return true;
    }
    const context = request.runtime?.cloudflare?.context;
    if (context) {
      context.waitUntil(task);
      return true;
    }
  } catch { /* no active request */ }
  try {
    const context = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      { get?: () => { waitUntil?: (task: Promise<unknown>) => void } } | undefined;
    const current = context?.get?.();
    if (current?.waitUntil) {
      current.waitUntil(task);
      return true;
    }
  } catch { /* no managed execution context */ }
  return false;
}