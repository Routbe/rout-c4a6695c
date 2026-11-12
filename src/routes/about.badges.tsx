import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/badges")({ head: () => docHead("/info/badges"), beforeLoad: () => { throw redirect({ href: "/info/badges", statusCode: 301 }); } });
