import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/safety/transparency")({ head: () => docHead("/safety/transparency"), component: Page });
function Page() { return <DocPage path="/safety/transparency" />; }
