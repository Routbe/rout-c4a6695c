import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/safety/privacy")({ head: () => docHead("/safety/privacy"), component: Page });
function Page() { return <DocPage path="/safety/privacy" />; }
