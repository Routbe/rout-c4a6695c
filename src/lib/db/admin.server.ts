/**
 * Privileged, server-only database client.
 *
 * Same shape as the client-side `db`, but statements run straight on Neon with
 * no policy layer — the caller is responsible for authorising the operation.
 * Also carries the small auth/storage helpers the old admin client provided.
 */
import { createDbClient } from "./builder";
import { executeDescriptor, executeRpc } from "./execute.server";
import { sql } from "@/lib/neon";

const base = createDbClient(
  (descriptor) => executeDescriptor(descriptor),
  (descriptor) => executeRpc(descriptor, null),
);

type AdminUser = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

function toAdminUser(row: Record<string, unknown> | undefined): AdminUser | null {
  if (!row) return null;
  return {
    id: String(row["id"]),
    email: String(row["email"]),
    email_confirmed_at: (row["email_confirmed_at"] as string | null) ?? null,
    created_at: String(row["created_at"]),
    last_sign_in_at: (row["last_sign_in_at"] as string | null) ?? null,
    user_metadata: (row["user_metadata"] as Record<string, unknown>) ?? {},
    app_metadata: (row["app_metadata"] as Record<string, unknown>) ?? {},
  };
}

const auth = {
  admin: {
    async getUserById(id: string) {
      const rows = (await sql.query(`select * from public.users where id = $1`, [id])) as Record<
        string,
        unknown
      >[];
      const user = toAdminUser(rows[0]);
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: "User not found" } };
    },

    async listUsers(options?: { page?: number; perPage?: number }) {
      const perPage = options?.perPage ?? 50;
      const page = options?.page ?? 1;
      const rows = (await sql.query(
        `select * from public.users order by created_at desc limit $1 offset $2`,
        [perPage, (page - 1) * perPage],
      )) as Record<string, unknown>[];
      return { data: { users: rows.map((r) => toAdminUser(r)!) }, error: null };
    },

    async createUser(input: {
      email: string;
      password?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    }) {
      const { createUser } = await import("@/lib/auth/users.server");
      try {
        const user = await createUser({
          email: input.email,
          ...(input.password ? { password: input.password } : {}),
          metadata: input.user_metadata ?? {},
          ...(input.email_confirm ? { emailConfirmed: true } : {}),
        });
        return {
          data: { user: toAdminUser(user as unknown as Record<string, unknown>) },
          error: null,
        };
      } catch (error) {
        return {
          data: { user: null },
          error: { message: error instanceof Error ? error.message : "Could not create user" },
        };
      }
    },

    async updateUserById(
      id: string,
      attributes: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
        /** Legacy Postgres field: "none" lifts the ban, anything else sets it. */
        ban_duration?: string;
      },
    ) {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (fragment: string, value: unknown) => {
        values.push(value);
        sets.push(`${fragment} $${values.length}`);
      };
      if (attributes.email !== undefined) push("email =", attributes.email);
      if (attributes.password !== undefined) {
        // Passkey-only platform: passwords are never stored.
        return { data: { user: null }, error: { message: "passwords_disabled" } };
      }
      if (attributes.email_confirm) sets.push("email_confirmed_at = now()");
      if (attributes.ban_duration !== undefined) {
        push("is_disabled =", attributes.ban_duration !== "none");
      }
      if (attributes.user_metadata) {
        push("user_metadata = user_metadata ||", JSON.stringify(attributes.user_metadata));
        sets[sets.length - 1] += "::jsonb";
      }
      if (attributes.app_metadata) {
        push("app_metadata = app_metadata ||", JSON.stringify(attributes.app_metadata));
        sets[sets.length - 1] += "::jsonb";
      }
      if (sets.length === 0) return await this.getUserById(id);
      values.push(id);
      const rows = (await sql.query(
        `update public.users set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
        values,
      )) as Record<string, unknown>[];
      const user = toAdminUser(rows[0]);
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: "User not found" } };
    },

    /** Mints one of our own single-use auth links (no third-party provider). */
    async generateLink(input: {
      type: "signup" | "magiclink" | "recovery" | "invite" | "email_change";
      email: string;
      options?: { redirectTo?: string };
    }) {
      const { findUserByEmail, issueToken } = await import("@/lib/auth/users.server");
      try {
        const purpose =
          input.type === "recovery"
            ? ("password_reset" as const)
            : input.type === "signup"
              ? ("email_confirm" as const)
              : ("magic_link" as const);
        const row = await findUserByEmail(input.email);
        if (!row) throw new Error("No account for this e-mail address");
        const token = await issueToken(String(row["id"]), purpose);
        const origin = (input.options?.redirectTo ?? "").replace(/\/+$/, "");
        return {
          data: {
            properties: {
              action_link: `${origin}/auth/verify?type=${purpose}&token=${token}`,
              hashed_token: token,
            },
            user: null,
          },
          error: null,
        };
      } catch (error) {
        return {
          data: { properties: null, user: null },
          error: { message: error instanceof Error ? error.message : "Could not generate link" },
        };
      }
    },
  },
};

/**
 * Avatars are served from the public avatar route backed by `profiles`; the old
 * object-storage bucket is gone, so these helpers report that plainly instead
 * of pretending to succeed.
 */
const STORAGE_MESSAGE = "Object storage is not part of the Neon setup; avatars are stored as URLs.";

const storage = {
  from(_bucket: string) {
    return {
      async list() {
        return { data: [], error: null };
      },
      async download(
        _path: string,
      ): Promise<{ data: Blob | null; error: { message: string } | null }> {
        return { data: null, error: { message: STORAGE_MESSAGE } };
      },
      async upload(_path: string, _file: unknown, _options?: unknown) {
        return { data: null, error: { message: STORAGE_MESSAGE } };
      },
      async remove(_paths: string[]) {
        return { data: null, error: { message: STORAGE_MESSAGE } };
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `/api/public/avatar?path=${encodeURIComponent(path)}` } };
      },
    };
  },
};

export const dbAdmin = { ...base, auth, storage };
