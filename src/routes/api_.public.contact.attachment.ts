import { createFileRoute } from "@tanstack/react-router";

/**
 * Anonymous bug-report attachment upload. Stores the file privately in the
 * internal bucket under `contact/`; the contact submission then references
 * the returned key. No session required, but strictly rate-limited and
 * content-sniffed. File contents and raw names are never written to logs.
 */
export const Route = createFileRoute("/api_/public/contact/attachment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "contact-attachment", 10, 10 * 60 * 1000);
        if (limited) return limited;

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "invalid_upload" }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "no_file" }, { status: 400 });
        }

        const {
          validateAttachmentFile,
          sniffAttachmentKind,
          sanitizeAttachmentName,
          ATTACHMENT_MIME,
        } = await import("@/lib/contact-attachments");

        const check = validateAttachmentFile(file.name, file.size);
        if (!check.ok) {
          return Response.json({ error: `invalid_${check.reason}` }, { status: 400 });
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!sniffAttachmentKind(bytes, check.kind)) {
          return Response.json({ error: "invalid_content" }, { status: 400 });
        }

        const { storageConfigured, putObject, StorageNotConfigured } = await import(
          "@/lib/storage/s3.server"
        );
        if (!storageConfigured("internal")) {
          return Response.json({ error: "storage_not_configured" }, { status: 503 });
        }

        const name = sanitizeAttachmentName(file.name);
        const key = `contact/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${check.kind}`;
        try {
          await putObject("internal", key, bytes, {
            contentType: ATTACHMENT_MIME[check.kind],
            cacheControl: "private, no-cache",
            metadata: { name },
          });
        } catch (error) {
          if (error instanceof StorageNotConfigured) {
            return Response.json({ error: "storage_not_configured" }, { status: 503 });
          }
          console.error("[contact-attachment] upload failed", { kind: check.kind, size: bytes.length });
          return Response.json({ error: "upload_failed" }, { status: 500 });
        }

        console.info("[contact-attachment] stored", { kind: check.kind, size: bytes.length });
        return Response.json({
          key,
          name,
          size: bytes.length,
          mime: ATTACHMENT_MIME[check.kind],
        });
      },
    },
  },
});
