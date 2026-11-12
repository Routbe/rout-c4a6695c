import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/developer/credentials")({ head: () => docHead("/dev/credentials-api"), beforeLoad: () => { throw redirect({ href: "/dev/credentials-api", statusCode: 301 }); } });
