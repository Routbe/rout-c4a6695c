import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/about/manifesto")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/about/manifesto", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/about/manifesto" />; }
