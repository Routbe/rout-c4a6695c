import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/referrals")({ head: () => docHead("/info/referrals"), component: Page });
function Page() { return <DocPage path="/info/referrals" />; }
