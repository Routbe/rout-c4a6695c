import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/account/data-domains")({ head: () => docHead("/support/account/data-domains"), component: Page });
function Page() { return <DocPage path="/support/account/data-domains" />; }
