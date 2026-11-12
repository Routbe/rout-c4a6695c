import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/workspace/getting-started/setup-business-account")({ head: () => docHead("/support/workspace/getting-started/setup-business-account"), component: Page });
function Page() { return <DocPage path="/support/workspace/getting-started/setup-business-account" />; }
