import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/custom-badges")({ head: () => docHead("/info/custom-badges"), beforeLoad: () => { throw redirect({ href: "/info/custom-badges", statusCode: 301 }); } });
