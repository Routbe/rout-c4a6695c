import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const listReservedBrandReleases = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listBrandReleases } = await import("./reserved-brands.server");
    return listBrandReleases();
  });

export const releaseReservedBrand = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ term: z.string().min(2).max(60), member: z.string().min(3).max(200), evidence: z.string().min(3).max(500) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { releaseBrand } = await import("./reserved-brands.server");
    return releaseBrand(context.userId, data);
  });
