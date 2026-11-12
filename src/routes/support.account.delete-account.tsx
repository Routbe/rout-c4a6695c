import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/support/account/delete-account")({ head: () => docHead("/support/account/delete-account"), component: Page });
function Page() { return <DocPage path="/support/account/delete-account" />; }
