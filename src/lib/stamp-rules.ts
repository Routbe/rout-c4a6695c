import { z } from "zod";

export const stampToken = z.string().regex(/^stamp_[a-z0-9]{8,32}$/);
export const claimLinkInput = z.object({
  badgeId: z.string().uuid(),
  maxClaims: z.number().int().min(1).max(100_000).nullable(),
  expiresAt: z.string().datetime().nullable(),
  reason: z.string().trim().max(200).nullable(),
}).refine((v) => v.maxClaims != null || v.expiresAt != null, "Stel een maximum of vervaldatum in.");

export function claimState(link: { revoked: boolean; expiresAt: string | null; maxClaims: number | null; claims: number }, now = Date.now()) {
  if (link.revoked) return "invalid" as const;
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now) return "expired" as const;
  if (link.maxClaims != null && link.claims >= link.maxClaims) return "exhausted" as const;
  return "open" as const;
}