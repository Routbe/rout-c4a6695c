import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/tools_/calendar")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/tools/calendar", statusCode: 301 }); } });
