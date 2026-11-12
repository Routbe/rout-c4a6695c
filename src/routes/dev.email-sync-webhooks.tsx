import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/dev/email-sync-webhooks")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/dev/email-sync-webhooks", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/dev/email-sync-webhooks" />; }
