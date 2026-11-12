import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

type DomainRow = { [key: string]: string | number | boolean | null };

/** Where a customer's domain must point for links to resolve. */
export const DOMAIN_CNAME_TARGET = "links.rout.app";
export const DOMAIN_A_TARGET = "185.158.133.1";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4)
  .max(253)
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    "Enter a bare hostname such as links.yourbrand.com",
  );

/** Register a domain and hand back the DNS records the user has to create. */
export const addCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ domain: domainSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { insertCustomDomain } = await import("./domains.server");
    return (await insertCustomDomain(context.userId, data.domain)) as unknown as DomainRow;
  });

/** Re-check DNS and flip the domain to verified when both records are live. */
export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { getOwnedDomain, updateDomainStatus, checkDomainDns } = await import("./domains.server");
    const row = await getOwnedDomain(data.id, context.userId);
    if (!row) throw new Error("Domain not found.");

    const check = await checkDomainDns(
      row.domain as string,
      row.verification_token as string,
      DOMAIN_CNAME_TARGET,
      DOMAIN_A_TARGET,
    );

    const verified = check.txtFound && check.cnameFound;
    const status = verified ? "verified" : check.txtFound ? "pointing" : "pending";

    await updateDomainStatus(row.id as string, status, verified);

    return { status, ...check };
  });

/** Exactly one domain can be the default used by new dynamic QRs. */
export const setDefaultDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { setDefaultDomainFor } = await import("./domains.server");
    await setDefaultDomainFor(context.userId, data.id);
    return { ok: true };
  });

/**
 * Short links on a branded domain are opt-in per domain. Switching this off
 * leaves existing links intact — they simply fall back to the ROUT domain, so
 * a half-configured domain never breaks a printed QR.
 */
export const setDomainShortLinks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { setDomainShortLinksFor } = await import("./domains.server");
    await setDomainShortLinksFor(context.userId, data.id, data.enabled);
    return { ok: true };
  });

export const setDomainRootRedirect = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), type: z.enum(["profile_hub", "custom_url", "rout_main", "none"]), url: z.string().max(2048).nullable().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { validRootRedirectUrl } = await import("./root-redirect");
    let url: string | null = null;
    if (data.type === "custom_url") {
      url = validRootRedirectUrl(data.url);
      if (!url) throw new Error("Vul een geldige https://-link in.");
    }
    // Custom-domain instellingen zijn een betaalde feature: net als de
    // sibling-functies hierboven is een actief abonnement vereist.
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { setRootRedirectFor } = await import("./domains.server");
    await setRootRedirectFor(context.userId, data.id, data.type, url);
    return { ok: true };
  });

export const deleteCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { deleteDomainFor } = await import("./domains.server");
    await deleteDomainFor(context.userId, data.id);
    return { ok: true };
  });

export const listCustomDomains = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId); // deep-link / direct-RPC protection
    const { listDomainsFor } = await import("./domains.server");
    return (await listDomainsFor(context.userId)) as unknown as DomainRow[];
  });

/**
 * Gebruik een via DNS geverifieerd domein als handle: `rout.be/example.be`.
 *
 * De domeinnaam wordt pas een handle wanneer die verificatie opnieuw slaagt —
 * we vertrouwen nooit op een eerder gezette status alleen. De naam belandt in
 * `profiles.subdomain_alias`, dezelfde naamruimte als gewone handles, en levert
 * de zwarte domeinbadge op.
 */
export const claimDomainAsHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertEntitled } = await import("./entitlement.server");
    await assertEntitled(context.userId);
    const { getOwnedDomain, checkDomainDns, updateDomainStatus } = await import(
      "./domains.server"
    );
    const row = await getOwnedDomain(data.id, context.userId);
    if (!row) throw new Error("Domein niet gevonden.");

    const check = await checkDomainDns(
      row.domain as string,
      row.verification_token as string,
      DOMAIN_CNAME_TARGET,
      DOMAIN_A_TARGET,
    );
    if (!check.txtFound) {
      throw new Error("DNS-verificatie mislukt — het TXT-record is nog niet zichtbaar.");
    }
    await updateDomainStatus(row.id as string, check.cnameFound ? "verified" : "pointing", true);

    const handle = String(row.domain).toLowerCase();
    const { isHandleAvailableFor } = await import("./handle-namespace.server");
    if (!(await isHandleAvailableFor(handle, context.userId))) {
      throw new Error("Deze naam is al in gebruik binnen ROUT.");
    }

    const { setSubdomainAliasFor } = await import("./domains.server");
    await setSubdomainAliasFor(context.userId, handle);
    return { handle };
  });
