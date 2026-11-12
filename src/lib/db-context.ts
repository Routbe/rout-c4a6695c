/** Pure helpers for the per-request Postgres RLS context (see neon.ts). */
export type DbContext = { userId: string | null; workspaceId: string | null };

type Statement = { query: string; params: unknown[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only well-formed UUIDs are passed on; anything else becomes null (no access). */
export function cleanContextId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

/** Statements that scope one transaction to the caller (equivalent to SET LOCAL). */
export function contextStatements(ctx: DbContext): Statement[] {
  return [
    {
      query: "select set_config('rout.current_user_id', $1, true), set_config('rout.user_id', $1, true), set_config('rout.workspace_id', $2, true)",
      params: [cleanContextId(ctx.userId) ?? "", cleanContextId(ctx.workspaceId) ?? ""],
    },
  ];
}
