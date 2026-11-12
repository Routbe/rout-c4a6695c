import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/info/no-account-lists")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/info/no-account-lists", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/info/no-account-lists" />; }
