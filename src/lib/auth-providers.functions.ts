import { createServerFn } from "@tanstack/react-start";

/** Public: which key-based sign-in providers are configured (no secrets returned). */
export const getEnabledProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { enabledProviders } = await import("@/lib/better-auth.server");
  return enabledProviders();
});
