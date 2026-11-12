import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/parental-consent")({ head: () => docHead("/info/parental-consent"), component: Page });
function Page() { return <DocPage path="/info/parental-consent" />; }
