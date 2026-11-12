import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/about/sovereignty")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/about/sovereignty", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/about/sovereignty" />; }
