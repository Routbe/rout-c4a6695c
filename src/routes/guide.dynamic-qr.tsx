import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/guide/dynamic-qr")({ head: () => docHead("/guide/dynamic-qr"), component: Page });
function Page() { return <DocPage path="/guide/dynamic-qr" />; }
