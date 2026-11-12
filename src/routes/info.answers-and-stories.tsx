import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/answers-and-stories")({ head: () => docHead("/info/answers-and-stories"), component: Page });
function Page() { return <DocPage path="/info/answers-and-stories" />; }