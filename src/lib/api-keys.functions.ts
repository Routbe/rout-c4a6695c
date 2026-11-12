import { requireDeveloperAccess } from "@/lib/auth/developer-access";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { hashApiKey, newApiKey } from "./api-keys.server";

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.db
      .from("api_keys")
      .select(
        "id, name, key_prefix, scopes, rate_limit, request_count, last_used_at, revoked_at, created_at",
      )
      .eq("user_id", context.userId)
      .is("workspace_id", context.activeWorkspaceId ?? null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        scopes: z
          .array(
            z.enum([
              "qr:read",
              "qr:write",
              "links:read",
              "links:write",
              "analytics:read",
              "domains:read",
              "profile:read",
              "profile:write",
              "bookings:read",
              "bookings:write",
            ]),
          )
          .min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { key, prefix } = newApiKey();
    const { data: row, error } = await context.db
      .from("api_keys")
      .insert({
        user_id: context.userId,
        workspace_id: context.activeWorkspaceId ?? null,
        name: data.name,
        key_hash: await hashApiKey(key),
        key_prefix: prefix,
        scopes: data.scopes,
      })
      .select(
        "id, name, key_prefix, scopes, rate_limit, request_count, last_used_at, revoked_at, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    // The plaintext key is returned exactly once.
    return { row, key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
