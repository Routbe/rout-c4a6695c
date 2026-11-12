import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth/middleware";
import { mastodonProfileSchema } from "./fediverse-profile";

export const getMyFediverseProfile = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { readFediverseProfile } = await import("./fediverse-profile.server");
  return readFediverseProfile(context.userId);
});
export const saveMyFediverseProfile = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((input: unknown) => mastodonProfileSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { saveFediverseProfile } = await import("./fediverse-profile.server");
    try { return { ok: true as const, identity: await saveFediverseProfile(context.user, data) }; }
    catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      return { ok: false as const, message: status === 403 ? "Bevestig je e-mailadres en kies een profielnaam." : "De koppeling kon tijdelijk niet worden opgeslagen." };
    }
  });
export const getMyVerificationSetup = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { readVerificationSetup } = await import("./fediverse-profile.server");
  try { return await readVerificationSetup(context.userId); }
  catch { return { urls: [] as string[], mastodonSuggestion: null as string | null, github: null as string | null }; }
});
