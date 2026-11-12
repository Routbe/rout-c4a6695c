import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth/middleware";
import type { VisitSpace, VisitStats } from "@/lib/visits.server";

/**
 * RPC-laag voor het bezoekerspaneel.
 *
 * `recordProfileVisit` is bewust publiek (bezoekers zijn niet ingelogd) maar
 * schrijft alleen geanonimiseerde tellingen weg; `getMyVisitStats` vereist een
 * sessie en geeft uitsluitend de cijfers van het eigen account terug.
 */

export const recordProfileVisit = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      handle: string;
      space: VisitSpace;
      path?: string | null;
      locale?: string | null;
    }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const { recordVisit } = await import("./visits.server");
      const ip =
        getRequestHeader("cf-connecting-ip") ??
        (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
        null;
      return await recordVisit({
        handle: data.handle,
        space: data.space === "root" ? "root" : "alias",
        path: data.path ?? null,
        locale: data.locale ?? null,
        ip,
        userAgent: getRequestHeader("user-agent") ?? null,
        country: getRequestHeader("cf-ipcountry") ?? null,
      });
    } catch {
      // Bezoekregistratie mag nooit een profielpagina breken.
      return { recorded: false };
    }
  });

export const getMyVisitStats = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { days?: number; space?: VisitSpace | "all" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { readVisitStats } = await import("./visits.server");
    return (await readVisitStats(context.userId, {
      days: data.days ?? 30,
      space: data.space ?? "all",
    })) as VisitStats;
  });

/** Publiek: één klik op een link van een profiel (anoniem, faalt stil). */
export const recordLinkClickFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { handle: string; blockId: string; label?: string | null; space: VisitSpace }) => ({
      handle: String(input.handle ?? ""),
      blockId: String(input.blockId ?? ""),
      label: input.label == null ? null : String(input.label),
      space: (input.space === "root" ? "root" : "alias") as VisitSpace,
    }),
  )
  .handler(async ({ data }) => {
    try {
      const { recordLinkClick } = await import("./visits.server");
      const ip =
        getRequestHeader("cf-connecting-ip") ??
        (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
        null;
      return await recordLinkClick({ ...data, ip, userAgent: getRequestHeader("user-agent") ?? null });
    } catch {
      return { recorded: false };
    }
  });

export const getMyLinkClickStats = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { days?: number; space?: VisitSpace | "all" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { readLinkClickStats } = await import("./visits.server");
    return await readLinkClickStats(context.userId, { days: data.days ?? 30, space: data.space ?? "all" });
  });
