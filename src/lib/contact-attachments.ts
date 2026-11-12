/**
 * Bug-report attachment rules — pure, browser-safe helpers shared by the
 * contact form and the upload endpoint. No external services.
 *
 * Allowed: screenshots (PNG/JPEG) and logs (TXT/LOG/JSON), max 5 MiB.
 * The real type is always sniffed from the first bytes; the client label
 * is never trusted.
 */

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.txt,.log,.json";

export type AttachmentKind = "png" | "jpg" | "txt" | "log" | "json";

const EXT_TO_KIND: Record<string, AttachmentKind> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  txt: "txt",
  log: "log",
  json: "json",
};

export const ATTACHMENT_MIME: Record<AttachmentKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  txt: "text/plain",
  log: "text/plain",
  json: "application/json",
};

export type AttachmentValidation =
  | { ok: true; kind: AttachmentKind }
  | { ok: false; reason: "name" | "type" | "size" | "content" };

/** Derive the attachment kind from the file extension (case-insensitive). */
export function attachmentKindFromName(name: string): AttachmentKind | null {
  const ext = name.trim().toLowerCase().split(".").pop() ?? "";
  return EXT_TO_KIND[ext] ?? null;
}

/** Strip paths, control characters and anything outside a safe alphabet. */
export function sanitizeAttachmentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "bijlage";
  const clean = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return clean || "bijlage";
}

/** Client-side pre-flight check before uploading. */
export function validateAttachmentFile(name: string, size: number): AttachmentValidation {
  if (!name.trim()) return { ok: false, reason: "name" };
  const kind = attachmentKindFromName(name);
  if (!kind) return { ok: false, reason: "type" };
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true, kind };
}

function isTextBytes(b: Uint8Array): boolean {
  // Reject NUL bytes and other binary control characters (keep \t \n \r).
  const sample = b.length > 4096 ? b.subarray(0, 4096) : b;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/** Server-side content sniff: the bytes must match the claimed kind. */
export function sniffAttachmentKind(bytes: Uint8Array, kind: AttachmentKind): boolean {
  if (bytes.length === 0) return false;
  if (kind === "png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (kind === "jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  // txt / log / json must be real UTF-8 text, never a renamed binary.
  return isTextBytes(bytes);
}
