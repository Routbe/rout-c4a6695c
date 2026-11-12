import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Volledige audit-log van root-subdomein claims (alleen beheerders). */
export const adminListRootClaims = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["all", "pending_dns", "active", "failed_mail"]).default("all"),
        search: z.string().max(120).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchRootClaims } = await import("./subdomain-claims.server");
    return fetchRootClaims({
      status: data.status,
      ...(data.search ? { search: data.search } : {}),
    });
  });

/** Handmatige promotie van `pending_dns` naar `active`. */
export const adminPromoteRootClaim = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { promoteClaim } = await import("./subdomain-claims.server");
    await promoteClaim(data.userId);
    return { ok: true };
  });

/** Herverstuurt de Brevo-notificaties van een claim (beheerder). */
export const adminResendClaimMail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { resendClaimMails } = await import("./subdomain-claims.server");
    return resendClaimMails(data.claimId);
  });

/** Claim-historie van de ingelogde gebruiker (Studio-overzicht). */
export const getMyRootClaims = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { fetchMyClaims } = await import("./subdomain-claims.server");
    return fetchMyClaims(context.userId);
  });

/** Laat de gebruiker zelf de notificatiemails opnieuw versturen. */
export const resendMyClaimMail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { fetchMyClaims, resendClaimMails } = await import("./subdomain-claims.server");
    const mine = await fetchMyClaims(context.userId);
    if (!mine.some((c) => c.id === data.claimId)) throw new Error("Claim niet gevonden");
    return resendClaimMails(data.claimId);
  });
