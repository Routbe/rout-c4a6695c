import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/product/batch-engine")({ head: () => docHead("/product/batch-engine"), component: Page });
function Page() { return <DocPage path="/product/batch-engine" />; }
