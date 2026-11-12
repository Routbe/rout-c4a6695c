import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/compare/auth0-alternative")({ head: () => docHead("/compare/auth0-alternative"), component: Page });
function Page() { return <DocPage path="/compare/auth0-alternative" />; }
