import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/guide/qr-code-frames")({ head: () => docHead("/guide/qr-code-frames"), component: Page });
function Page() { return <DocPage path="/guide/qr-code-frames" />; }
