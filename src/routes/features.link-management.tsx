import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/features/link-management")({ head: () => docHead("/features/link-management"), component: Page });
function Page() { return <DocPage path="/features/link-management" />; }
