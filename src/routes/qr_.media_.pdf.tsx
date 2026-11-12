import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/media_/pdf")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/media/pdf", statusCode: 301 }); } });
