import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/solutions/")({ head: () => docHead("/solutions"), component: Page });
function Page() { return <DocPage path="/solutions" />; }
