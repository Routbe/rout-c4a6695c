import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/safety/compliance")({ head: () => docHead("/safety/compliance"), component: Page });
function Page() { return <DocPage path="/safety/compliance" />; }
