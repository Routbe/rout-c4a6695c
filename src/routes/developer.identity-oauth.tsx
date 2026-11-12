import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/developer/identity-oauth")({ head: () => docHead("/dev/identity-oidc"), beforeLoad: () => { throw redirect({ href: "/dev/identity-oidc", statusCode: 301 }); } });
