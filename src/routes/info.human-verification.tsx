import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/human-verification")({ head: () => docHead("/info/human-verification"), component: Page });
function Page() { return <DocPage path="/info/human-verification" />; }
