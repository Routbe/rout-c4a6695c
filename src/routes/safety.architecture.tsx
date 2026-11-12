import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/safety/architecture")({ head: () => docHead("/safety/architecture"), component: Page });
function Page() { return <DocPage path="/safety/architecture" />; }
