import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/features/asset-manager")({ head: () => docHead("/features/asset-manager"), component: Page });
function Page() { return <DocPage path="/features/asset-manager" />; }
