import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/features/design-studio")({ head: () => docHead("/features/design-studio"), component: Page });
function Page() { return <DocPage path="/features/design-studio" />; }
