import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth/middleware";
import { saveBioSchema } from "./bio-validation";

export const saveBioTranslations = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => saveBioSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { sql } = await import("./neon");
    const bio = data.descriptions[data.sourceLocale];
    if (data.variant === "alias") {
      await sql`update public.alias_profiles set profile_descriptions = ${JSON.stringify(data.descriptions)}::jsonb,
        bio = case when ${data.confirmSourceBio} then ${bio} else bio end where user_id = ${context.userId}`;
    } else {
      await sql`update public.profiles set profile_descriptions = ${JSON.stringify(data.descriptions)}::jsonb,
        bio = case when ${data.confirmSourceBio} then ${bio} else bio end where id = ${context.userId}`;
    }
    return { ok: true };
  });
