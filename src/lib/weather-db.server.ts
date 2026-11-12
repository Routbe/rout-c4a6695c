import { hasDatabase, runQuery } from "@/lib/neon";

/**
 * Weather-only database boundary. Uses the shared Neon transport (DATABASE_URL
 * on Vercel, the Lovable connector in preview). Never expose credentials or
 * database errors to visitors.
 */
export async function weatherQuery<T extends Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!hasDatabase()) throw new Error("Weather database connection unavailable");
  try {
    const result = await runQuery(query, params);
    if (!Array.isArray(result.rows)) throw new Error("Invalid weather database response");
    return result.rows as T[];
  } catch (err) {
    console.error("[ambient-weather] database request failed:", err instanceof Error ? err.message : err);
    throw new Error("Weather database unavailable");
  }
}
