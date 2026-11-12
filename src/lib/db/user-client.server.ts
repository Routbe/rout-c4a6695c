/**
 * Server-side database client bound to one signed-in member.
 *
 * Replaces the "RLS as the user" client the old backend put on the server
 * function context: queries from our own server code are trusted, but rows of
 * user-owned tables are still narrowed to the acting member so a missing
 * `.eq("user_id", ...)` cannot leak another account's data.
 */
import { createDbClient } from "./builder";
import { executeDescriptor, executeRpc } from "./execute.server";
import type { QueryDescriptor } from "./types";

/** Ownership column per table; tables absent here are used as-is. */
const OWNER_COLUMN: Record<string, string> = {
  profiles: "id",
  links: "profile_id",
  saved_qrs: "user_id",
  tracked_qrs: "user_id",
  user_badges: "user_id",
  badge_events: "user_id",
  notifications: "user_id",
  custom_domains: "user_id",
  email_aliases: "user_id",
  api_keys: "user_id",
  verification_payments: "user_id",
  user_roles: "user_id",
};

function scope(descriptor: QueryDescriptor, userId: string): QueryDescriptor {
  const owner = OWNER_COLUMN[descriptor.table];
  if (!owner) return descriptor;
  // Profiles are publicly readable by design; only writes are narrowed.
  if (descriptor.table === "profiles" && descriptor.action === "select") return descriptor;

  if (descriptor.action === "insert" || descriptor.action === "upsert") {
    const rows = Array.isArray(descriptor.values) ? descriptor.values : [descriptor.values ?? {}];
    return { ...descriptor, values: rows.map((row) => ({ [owner]: userId, ...row })) };
  }
  if (descriptor.filters.some((f) => f.column === owner && f.op === "eq")) return descriptor;
  return {
    ...descriptor,
    filters: [...descriptor.filters, { op: "eq", column: owner, value: userId }],
  };
}

export function createUserDb(userId: string) {
  return createDbClient(
    (descriptor) => executeDescriptor(scope(descriptor, userId)),
    (descriptor) => executeRpc(descriptor, userId),
  );
}

export type UserDb = ReturnType<typeof createUserDb>;
