import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/payment_")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/payment", statusCode: 301 }); } });
