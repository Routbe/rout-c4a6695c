/**
 * Shared server-side diagnostics for privileged paths.
 *
 * Every privileged path (admin operations, Mastodon session minting, the
 * short-link resolver) runs through here so a stalled dependency fails
 * *immediately* with one readable sentence instead of hanging on a request that
 * can never succeed. Nothing sensitive is ever logged: only event names,
 * timings and non-secret context.
 */

/** Hard ceiling for any single privileged network call. */
export const SERVER_AUTH_TIMEOUT_MS = 10_000;

/** Structured, single-line server log — greppable in the runtime logs. */
export function authLog(
  scope: string,
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    scope,
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Adds a hard timeout to a fetch so a stalled dependency surfaces as a clear
 * error instead of an endless spinner in the browser.
 */
export function withFetchTimeout(
  baseFetch: typeof fetch,
  scope: string,
  timeoutMs: number = SERVER_AUTH_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const external = init?.signal;
    const onAbort = () => controller.abort();
    external?.addEventListener("abort", onAbort);
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted && !external?.aborted) {
        authLog(scope, "error", "request_timeout", { timeoutMs });
        throw new Error(
          `The backend did not respond within ${Math.round(
            timeoutMs / 1000,
          )} seconds. Please try again in a moment.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    }
  };
}

/** Secondary helpers sit on the critical rendering path — keep them snappy. */
export const PUBLIC_QUERY_TIMEOUT_MS = 6_000;

/** Hard deadline for any promise in a secondary helper. */
export async function withServerTimeout<T>(
  promise: PromiseLike<T>,
  scope: string,
  timeoutMs = PUBLIC_QUERY_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          authLog(scope, "error", "timeout", { timeoutMs });
          reject(new Error(`${scope} did not respond within ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
