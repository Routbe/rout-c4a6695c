import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/product/profile-hub")({ head: () => docHead("/product/profile-hub"), component: Page });
function Page() { return <DocPage path="/product/profile-hub" />; }
