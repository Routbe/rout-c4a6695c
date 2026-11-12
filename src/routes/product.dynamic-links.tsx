import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/product/dynamic-links")({ head: () => docHead("/product/dynamic-links"), component: Page });
function Page() { return <DocPage path="/product/dynamic-links" />; }
