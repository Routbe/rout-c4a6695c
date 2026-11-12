import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/usernames")({ head: () => docHead("/info/usernames"), component: Page });
function Page() { return <DocPage path="/info/usernames" />; }
