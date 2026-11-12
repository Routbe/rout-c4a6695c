import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/qr_/media_/image")({ beforeLoad: () => { throw redirect({ href: "/qr-code-generator/media/image", statusCode: 301 }); } });
