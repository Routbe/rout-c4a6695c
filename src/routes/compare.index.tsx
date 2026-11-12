import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/compare/")({ head: () => docHead("/compare"), component: Page });
function Page() { return <DocPage path="/compare" />; }
