/** Universal Handle Sync rule: `rout_handle` only when the app opted in AND the `profile` scope was granted. */
export function routHandleClaim(enabled: boolean, scopes: string[], username: unknown): string | null | undefined {
  if (!enabled || !scopes.includes("profile")) return undefined;
  return typeof username === "string" && username ? username : null;
}
