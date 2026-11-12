import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/info/sign-in-with-rout")({ head: () => docHead("/info/sign-in-with-rout"), component: Page });
function Page() { return <DocPage path="/info/sign-in-with-rout" />; }
