import type { AuthReadiness } from "@/lib/auth-readiness";

/** Keep the complete catalog visible; configuration controls use, not discovery. */
export function providerAvailable(id: string, configured: readonly string[], readiness: AuthReadiness | null): boolean {
  return readiness?.ready === true && configured.includes(id);
}