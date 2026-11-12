import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/custom-badges")({ head: () => docHead("/info/custom-badges"), component: Page });
function Page() { return <DocPage path="/info/custom-badges" />; }
