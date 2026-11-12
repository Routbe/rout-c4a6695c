import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/payment_/sepa")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/payment/sepa", statusCode: 301 }); } });
