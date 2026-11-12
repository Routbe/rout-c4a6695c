import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/developer/webhooks")({ head: () => docHead("/dev/webhooks"), beforeLoad: () => { throw redirect({ href: "/dev/webhooks", statusCode: 301 }); } });
