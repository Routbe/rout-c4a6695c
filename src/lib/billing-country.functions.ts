import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { sql } from "@/lib/neon";

/**
 * Slaat het gekozen factureringsland (ISO 3166-1 alpha-2) op bij het profiel,
 * zodat de checkout- en valuta-routing na een herbezoek meteen klopt.
 */
export const saveBillingCountry = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        country: z
          .string()
          .trim()
          .transform((v) => v.toUpperCase())
          .refine((v) => /^[A-Z]{2}$/.test(v), "invalid_country"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      await sql`
        insert into public.profiles (id, country_code, updated_at)
        values (${context.userId}, ${data.country}, now())
        on conflict (id) do update set country_code = excluded.country_code, updated_at = now()
      `;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "update_failed";
      return { ok: false as const, reason };
    }
    return { ok: true as const };
  });

/** Leest het opgeslagen factureringsland van het ingelogde lid. */
export const getBillingCountry = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    try {
      const rows = (await sql`
        select country_code from public.profiles where id = ${context.userId} limit 1
      `) as Record<string, unknown>[];
      const code = rows[0]?.["country_code"];
      return { country: typeof code === "string" && code ? code.toUpperCase() : null };
    } catch {
      return { country: null };
    }
  });
