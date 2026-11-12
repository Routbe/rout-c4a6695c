import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/links-and-analytics")({ head: () => docHead("/info/links-and-analytics"), component: Page });
function Page() { return <DocPage path="/info/links-and-analytics" />; }
