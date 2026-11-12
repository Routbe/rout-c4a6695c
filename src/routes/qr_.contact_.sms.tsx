import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/contact_/sms")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/contact/sms", statusCode: 301 }); } });
