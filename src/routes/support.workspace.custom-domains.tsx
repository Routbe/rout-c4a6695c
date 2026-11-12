import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/workspace/custom-domains")({ head: () => docHead("/support/workspace/custom-domains"), component: Page });
function Page() { return <DocPage path="/support/workspace/custom-domains" />; }
