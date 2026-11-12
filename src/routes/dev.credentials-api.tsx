import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/dev/credentials-api")({ head: () => docHead("/dev/credentials-api"), component: Page });
function Page() { return <DocPage path="/dev/credentials-api" />; }
