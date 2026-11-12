import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/info/connected-apps")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/info/connected-apps", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/info/connected-apps" />; }
