import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/workspace/team-roles")({ head: () => docHead("/support/workspace/team-roles"), component: Page });
function Page() { return <DocPage path="/support/workspace/team-roles" />; }
