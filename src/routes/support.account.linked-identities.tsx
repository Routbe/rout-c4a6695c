import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/account/linked-identities")({ head: () => docHead("/support/account/linked-identities"), component: Page });
function Page() { return <DocPage path="/support/account/linked-identities" />; }
