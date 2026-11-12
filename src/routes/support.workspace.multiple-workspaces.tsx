import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/workspace/multiple-workspaces")({ head: () => docHead("/support/workspace/multiple-workspaces"), component: Page });
function Page() { return <DocPage path="/support/workspace/multiple-workspaces" />; }
