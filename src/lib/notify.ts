import { toast } from "sonner";

/**
 * Throttled, de-duplicated notifications.
 *
 * Background polling and repeated fetch failures used to stack dozens of
 * identical toasts. Every message is keyed; the same key can only surface once
 * per cooldown window, and quiet failures are logged instead of shown.
 */
const WINDOW_MS = 15_000;
const lastShown = new Map<string, number>();

function allow(key: string, windowMs = WINDOW_MS): boolean {
  const now = Date.now();
  const previous = lastShown.get(key);
  if (previous && now - previous < windowMs) return false;
  lastShown.set(key, now);
  return true;
}

type Options = { description?: string; key?: string; windowMs?: number };

export function notifyError(title: string, options: Options = {}) {
  if (!allow(options.key ?? `error:${title}`, options.windowMs)) return;
  toast.error(title, options.description ? { description: options.description } : undefined);
}

export function notifySuccess(title: string, options: Options = {}) {
  if (!allow(options.key ?? `success:${title}`, options.windowMs ?? 2_000)) return;
  toast.success(title, options.description ? { description: options.description } : undefined);
}

export function notifyInfo(title: string, options: Options = {}) {
  if (!allow(options.key ?? `info:${title}`, options.windowMs ?? 2_000)) return;
  toast.info(title, options.description ? { description: options.description } : undefined);
}

/** Background/polling failure: never interrupts the user, only logs. */
export function logQuietly(context: string, error: unknown) {
  if (import.meta.env.DEV) console.warn(`[${context}]`, error);
}
