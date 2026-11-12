import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/newsletter")({ head: () => docHead("/info/newsletter"), component: Page });
function Page() { return <DocPage path="/info/newsletter" />; }
