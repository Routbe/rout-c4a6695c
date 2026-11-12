import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/compare/linktree-alternative")({ head: () => docHead("/compare/linktree-alternative"), component: Page });
function Page() { return <DocPage path="/compare/linktree-alternative" />; }
