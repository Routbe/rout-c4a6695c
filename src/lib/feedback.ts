import { z } from "zod";

export const FEEDBACK_TYPES = ["stars_5", "nps_10", "emoji_3", "text_review"] as const;
export type FeedbackType = typeof FEEDBACK_TYPES[number];
export const feedbackFormSchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: z.enum(FEEDBACK_TYPES).default("stars_5"),
  showOnProfile: z.boolean().default(true),
  fullPage: z.boolean().default(false),
  profileSpace: z.enum(["root", "alias", "workspace"]),
  profileHandle: z.string().trim().toLowerCase().min(1).max(64),
});
export const feedbackResponseSchema = z.object({
  formId: z.string().uuid(),
  rating: z.number().int().nullable().default(null),
  comment: z.string().trim().max(2000).default(""),
  reviewerName: z.string().trim().max(100).default(""),
  allowFeatured: z.boolean().default(false),
  company: z.string().max(200).default(""),
});
export type FeedbackFormInput = z.input<typeof feedbackFormSchema>;
export type FeedbackResponseInput = z.input<typeof feedbackResponseSchema>;
export type FeedbackForm = {
  id: string; title: string; type: FeedbackType; slug: string;
  showOnProfile: boolean; fullPage: boolean; profileSpace: "root" | "alias" | "workspace";
  profileHandle: string; count: number; average: number | null;
};
export type FeedbackReview = {
  id: string; formId: string; rating: number | null; comment: string;
  reviewerName: string; isFeatured: boolean; allowFeatured: boolean; createdAt: string;
};
export type PublicFeedback = { form: FeedbackForm; featured: FeedbackReview[] };

/** Rating ranges come from the stored form, never from a visitor's claimed type. */
export function validFeedbackAnswer(type: FeedbackType, rating: number | null, comment: string): boolean {
  if (type === "text_review") return rating === null && comment.trim().length > 0;
  const min = type === "nps_10" ? 0 : 1;
  const max = type === "nps_10" ? 10 : type === "emoji_3" ? 3 : 5;
  return rating !== null && Number.isInteger(rating) && rating >= min && rating <= max;
}
export const feedbackPath = (slug: string) => `/feedback/${encodeURIComponent(slug)}`;
export function feedbackScopeMatches(owner: string, workspace: string | null, userId: string, active: string | null): boolean {
  return active === null ? workspace === null && owner === userId : workspace === active;
}