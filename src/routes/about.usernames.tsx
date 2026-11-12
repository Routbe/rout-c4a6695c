import { createFileRoute, redirect } from "@tanstack/react-router";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/usernames")({ head: () => docHead("/info/usernames"), beforeLoad: () => { throw redirect({ href: "/info/usernames", statusCode: 301 }); } });
