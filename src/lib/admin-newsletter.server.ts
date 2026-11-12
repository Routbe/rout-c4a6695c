/**
 * Admin view of signup-block subscriptions: platform-wide counts only.
 *
 * Subscriber addresses are encrypted and readable solely by the profile owner
 * through the Studio export, so this module never selects or returns them.
 */
export interface NewsletterOverview {
  counts: { total: number; pending: number; confirmed: number; unsubscribed: number; synced: number; failed: number };
  brevoConfigured: boolean;
}

export async function fetchNewsletterOverview(): Promise<NewsletterOverview> {
  const { platformSubscriberCounts } = await import("@/lib/newsletter.server");
  return { counts: await platformSubscriberCounts(), brevoConfigured: Boolean(process.env["BREVO_API_KEY"]) };
}
