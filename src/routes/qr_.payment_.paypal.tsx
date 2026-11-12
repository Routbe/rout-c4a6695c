import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/payment_/paypal")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/payment/paypal", statusCode: 301 }); } });
