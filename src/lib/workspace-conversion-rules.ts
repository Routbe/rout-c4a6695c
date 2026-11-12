/** Pure rules for converting a personal account into a Workspace. */
import { z } from "zod";
import { INVITE_ROLES, MAX_WIZARD_INVITES, WORKSPACE_CATEGORIES } from "./workspace-wizard";
import { workspaceBillingSchema } from "./workspace-pricing";

export const SUNSET_DAYS = 30;
export const TRANSFER_TTL_DAYS = 7;

export type TransferStatus = "pending" | "otp_ok" | "accepted" | "completed" | "cancelled" | "expired";

export type TransferState = {
  status: TransferStatus;
  otpVerifiedAt: string | null;
  acceptedAt: string | null;
  targetUserId: string | null;
  expiresAt: string;
};

export function sunsetDate(from: Date): Date {
  return new Date(from.getTime() + SUNSET_DAYS * 24 * 60 * 60 * 1000);
}

/** Both parties must have agreed (code + owner acceptance) and the transfer must still be open. */
export function canExecute(t: TransferState, now: Date): boolean {
  if (t.status === "completed" || t.status === "cancelled" || t.status === "expired") return false;
  if (new Date(t.expiresAt).getTime() <= now.getTime()) return false;
  return Boolean(t.otpVerifiedAt && t.acceptedAt && t.targetUserId);
}

/** Status after recording one side's consent. */
export function statusAfter(t: Pick<TransferState, "otpVerifiedAt" | "acceptedAt">): TransferStatus {
  if (t.otpVerifiedAt && t.acceptedAt) return "accepted";
  if (t.otpVerifiedAt) return "otp_ok";
  return "pending";
}

/** The owner must be another human account than the one being converted. */
export function checkTarget(sourceUserId: string, sourceEmail: string, target: { userId?: string | null; email?: string | null }): string | null {
  if (target.userId && target.userId === sourceUserId) return "same_account";
  if (target.email && target.email.trim().toLowerCase() === sourceEmail.trim().toLowerCase()) return "same_account";
  return null;
}

/** Blue (personal) verification never carries over; workspaces start without a badge. */
export function badgeAfterConversion(_before: "blue" | "none"): "none" {
  return "none";
}

export function isSunsetActive(status: string | null | undefined, sunsetAt: string | null | undefined, now: Date): boolean {
  return status === "migrated_sunset" && !!sunsetAt && new Date(sunsetAt).getTime() > now.getTime();
}

/**
 * Wizard answers that travel with a conversion until both sides agreed: organisation type,
 * description, extra colleagues (e-mail or @username) and the chosen plan (intent only, never a paid grant).
 */
export const conversionDetailsSchema = z.object({
  description: z.string().trim().max(280).default(""),
  category: z.enum(WORKSPACE_CATEGORIES).nullable().default(null),
  invites: z.array(z.object({ target: z.string().trim().min(3).max(254), role: z.enum(INVITE_ROLES) })).max(MAX_WIZARD_INVITES).default([]),
  /** Chosen address rout.be/w/<slug>; null = derived from the old username. */
  slug: z.string().trim().toLowerCase().max(40).nullable().default(null),
}).extend(workspaceBillingSchema.shape);
export type ConversionDetails = z.infer<typeof conversionDetailsSchema>;

/** Stored details are re-validated on execution; anything invalid falls back to safe defaults. */
export function readConversionDetails(raw: unknown): ConversionDetails {
  const parsed = conversionDetailsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : conversionDetailsSchema.parse({});
}

/** Converted logins keep full access (as workspace admin) until the sunset date, then they are removed. */
export const SUNSET_MEMBER_ROLE = "admin" as const;

/** Whole days left before the sunset (0 on the last day), never negative. */
export function daysLeft(sunsetAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(sunsetAt).getTime() - now.getTime()) / 86_400_000));
}

/** Address rout.be/w/<slug> suggested from the old username (dots become dashes). */
export function suggestedConversionSlug(username: string | null | undefined, workspaceName: string): string {
  const base = (username ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (base.length >= 3) return base;
  return workspaceName.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export type ConversionDraft = { payload: Record<string, unknown>; published: boolean };

/**
 * Which personal design the workspace gets. The verified profile's design wins
 * (when the account is verified and has one); the other design is kept as an
 * unpublished concept. Live = what rout.be/w/<slug> shows, or null when nothing was published.
 */
export function pickConversionDesign(i: { verified: boolean; verifiedDraft: ConversionDraft | null; aliasDraft: ConversionDraft | null }): {
  live: Record<string, unknown> | null;
  concept: Record<string, unknown> | null;
} {
  const primary = i.verified && i.verifiedDraft ? i.verifiedDraft : i.aliasDraft ?? i.verifiedDraft;
  if (!primary) return { live: null, concept: null };
  const other = primary === i.verifiedDraft ? i.aliasDraft : i.verifiedDraft;
  const live = primary.published ? primary.payload : null;
  // Concept: the other design if there is one, otherwise the primary itself.
  const concept = other ? other.payload : primary.payload;
  return { live, concept };
}
