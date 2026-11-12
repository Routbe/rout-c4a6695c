import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/guide/qr-code-design")({ head: () => docHead("/guide/qr-code-design"), component: Page });
function Page() { return <DocPage path="/guide/qr-code-design" />; }
