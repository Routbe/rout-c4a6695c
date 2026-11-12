/**
 * Tolerance for optional profile columns.
 *
 * Some deployments run a database that is a migration behind and lacks
 * optional columns such as `verified_legal_name`. Postgres answers those
 * queries with 42703 ("column ... does not exist"). Instead of crashing the
 * page we retry the same select without the optional columns, so the feature
 * degrades gracefully instead of taking the whole screen down.
 */

export const UNDEFINED_COLUMN = "42703";

export function isMissingColumnError(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === UNDEFINED_COLUMN) return true;
  return typeof e.message === "string" && /column .* does not exist/i.test(e.message);
}

/** Columns treated as optional everywhere a profile row is read. */
export const OPTIONAL_PROFILE_COLUMNS = ["verified_legal_name"];

export function withoutColumns(columns: string, drop: string[] = OPTIONAL_PROFILE_COLUMNS): string {
  return columns
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !drop.includes(c))
    .join(", ");
}

type Result<T> = { data: T | null; error: unknown };

/**
 * Runs `run(columns)`; when the database rejects it because an optional column
 * is missing, retries once with those columns stripped out.
 */
export async function selectTolerant<T>(
  columns: string,
  run: (cols: string) => PromiseLike<Result<T>>,
  drop: string[] = OPTIONAL_PROFILE_COLUMNS,
): Promise<Result<T>> {
  const first = await run(columns);
  if (!first.error || !isMissingColumnError(first.error)) return first;

  const reduced = withoutColumns(columns, drop);
  if (
    !reduced ||
    reduced ===
      columns
        .split(",")
        .map((c) => c.trim())
        .join(", ")
  )
    return first;

  console.warn("[db:optional-columns:missing]", {
    dropped: drop,
    retryWith: reduced,
  });
  return run(reduced);
}
