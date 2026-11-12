import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/guide/")({ head: () => docHead("/guide"), component: Page });
function Page() { return <DocPage path="/guide" />; }
