import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/payment_/wero")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/payment/wero", statusCode: 301 }); } });
