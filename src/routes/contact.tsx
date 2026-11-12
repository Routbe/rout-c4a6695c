import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Contact";

export const Route = createFileRoute("/contact")({
  loader: () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => ({
    meta: pageMeta("contact", loaderData?.locale),
  }),
  component: Page,
});
