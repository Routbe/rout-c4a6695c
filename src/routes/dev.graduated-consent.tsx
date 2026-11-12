import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/dev/graduated-consent")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/dev/graduated-consent", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/dev/graduated-consent" />; }
