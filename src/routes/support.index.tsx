import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/")({ head: () => docHead("/support"), component: Page });
function Page() { return <DocPage path="/support" />; }
