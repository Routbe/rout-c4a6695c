import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/solutions/agencies")({ head: () => docHead("/solutions/agencies"), component: Page });
function Page() { return <DocPage path="/solutions/agencies" />; }
