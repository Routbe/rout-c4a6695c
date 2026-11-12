import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/credentials")({ head: () => docHead("/info/credentials"), component: Page });
function Page() { return <DocPage path="/info/credentials" />; }
