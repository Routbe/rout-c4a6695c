import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
import { getRequestLocale } from "@/lib/locale.functions";
export const Route = createFileRoute("/dev/blind-hash-matching")({ loader: () => getRequestLocale(), head: ({ loaderData }) => docHead("/dev/blind-hash-matching", loaderData?.locale), component: Page });
function Page() { return <DocPage path="/dev/blind-hash-matching" />; }
