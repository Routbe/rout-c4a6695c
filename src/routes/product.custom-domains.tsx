import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/product/custom-domains")({ head: () => docHead("/product/custom-domains"), component: Page });
function Page() { return <DocPage path="/product/custom-domains" />; }
