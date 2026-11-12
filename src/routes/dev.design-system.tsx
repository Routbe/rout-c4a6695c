import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/dev/design-system")({ head: () => docHead("/dev/design-system"), component: Page });
function Page() { return <DocPage path="/dev/design-system" />; }
