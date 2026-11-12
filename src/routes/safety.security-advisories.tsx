import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/safety/security-advisories")({ head: () => docHead("/safety/security-advisories"), component: Page });
function Page() { return <DocPage path="/safety/security-advisories" />; }
