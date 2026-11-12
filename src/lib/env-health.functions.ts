import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

export type ServiceHealth = {
  key: "neon" | "brevo" | "stripe" | "stripe_webhook";
  label: string;
  ok: boolean;
  detail: string;
};

export type EnvHealth = {
  services: ServiceHealth[];
  missingRequired: string[];
  missingOptional: string[];
};

/** Live status van Neon, Brevo en Stripe + ontbrekende env-variabelen (beheerders). */
export const getEnvHealth = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<EnvHealth> => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { probeServices } = await import("./env-health.server");
    return probeServices();
  });
