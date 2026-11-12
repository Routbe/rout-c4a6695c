import { i18n } from "@/lib/i18n";

/**
 * Client-side safety net for sign-in.
 *
 * Every auth call the browser makes gets a hard deadline, so a backend that is
 * unreachable, misconfigured or simply slow ends in a readable message instead
 * of a spinner that never stops.
 */
export const AUTH_TIMEOUT_MS = 5_000;
export const AUTH_GUARD_TIMEOUT_MS = 5_000;

/** Locale-aware: resolved at throw time so the message follows the UI language. */
export const authTimeoutMessage = () => i18n.t("auth.timeout") as string;

export class AuthTimeoutError extends Error {
  constructor(message = authTimeoutMessage()) {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

/** Rejects with {@link AuthTimeoutError} when the call outlives the deadline. */
export function withAuthTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  timeoutMs: number = AUTH_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(`[auth:timeout] ${label} exceeded ${timeoutMs}ms`);
      reject(new AuthTimeoutError());
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Same deadline, but resolves to a fallback so the flow can continue. */
export async function withAuthFallback<T>(
  promise: PromiseLike<T>,
  fallback: T,
  label: string,
  timeoutMs: number = AUTH_GUARD_TIMEOUT_MS,
): Promise<T> {
  try {
    return await withAuthTimeout(promise, label, timeoutMs);
  } catch {
    return fallback;
  }
}

/** Message for any thrown auth failure, timeout included. */
export function authFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof AuthTimeoutError) return error.message;
  const message = error instanceof Error ? error.message : "";
  return message || fallback;
}
