import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/guestbook")({ head: () => docHead("/info/guestbook"), component: Page });
function Page() { return <DocPage path="/info/guestbook" />; }
