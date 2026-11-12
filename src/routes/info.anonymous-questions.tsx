import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/anonymous-questions")({ head: () => docHead("/info/anonymous-questions"), component: Page });
function Page() { return <DocPage path="/info/anonymous-questions" />; }