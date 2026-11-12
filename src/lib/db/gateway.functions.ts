import { createServerFn } from "@tanstack/react-start";
import type { QueryDescriptor, QueryResult, RpcDescriptor } from "./types";
import { querySchema } from "./query-schema";

/**
 * The single door between the browser and Neon.
 *
 * Every query the UI builds arrives here as a description, is checked against
 * the access policy for the signed-in member, and only then becomes SQL.
 */

async function currentUserId(): Promise<string | null> {
  const { currentUser } = await import("@/lib/auth/session.server");
  const user = await currentUser().catch(
    () => null,
  );
  return user?.id ?? null;
}

export const runDbQuery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): QueryDescriptor => querySchema.parse(input))
  .handler(async ({ data }): Promise<QueryResult> => {
    const { authorizeQuery } = await import("./policy.server");
    const { executeDescriptor } = await import("./execute.server");
    const { withDbContext } = await import("@/lib/neon");
    const userId = await currentUserId();
    return withDbContext({ userId, workspaceId: null }, async () => {
    const decision = await authorizeQuery(data, userId);
    if (!decision.ok) {
      return {
        data: data.rowMode ? null : [],
        error: { message: decision.message },
        count: null,
        status: 403,
      };
    }
    return await executeDescriptor(decision.descriptor);
    });
  });

export const runDbRpc = createServerFn({ method: "POST" })
  .inputValidator((input: RpcDescriptor) => input)
  .handler(async ({ data }): Promise<QueryResult> => {
    const { authorizeRpc } = await import("./policy.server");
    const { executeRpc } = await import("./execute.server");
    const { withDbContext } = await import("@/lib/neon");
    const userId = await currentUserId();
    return withDbContext({ userId, workspaceId: null }, async () => {
    const decision = authorizeRpc(data.fn, userId);
    if (!decision.ok) {
      return { data: null, error: { message: decision.message }, count: null, status: 403 };
    }
    return await executeRpc(data, userId);
    });
  });
