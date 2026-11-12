import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/dev/get-started")({ head: () => docHead("/dev/get-started"), component: Page });
function Page() { return <DocPage path="/dev/get-started" />; }
