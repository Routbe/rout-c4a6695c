import { createFileRoute } from "@tanstack/react-router";
import { QrToolPage } from "@/components/tools/QrToolPage";
import { QR_TOOL_BY_SLUG, toolHead } from "@/lib/qr-tools";

const tool = QR_TOOL_BY_SLUG["iban-qr"]!;

export const Route = createFileRoute("/iban-qr")({
  head: () => toolHead(tool),
  component: () => <QrToolPage tool={tool} />,
});
