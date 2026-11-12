import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/qr-code-generator/contact/whatsapp")({ head: () => docHead("/qr-code-generator/contact/whatsapp"), component: Page });
function Page() { return <DocPage path="/qr-code-generator/contact/whatsapp" />; }
