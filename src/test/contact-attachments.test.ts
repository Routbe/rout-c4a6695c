import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKindFromName,
  sanitizeAttachmentName,
  sniffAttachmentKind,
  validateAttachmentFile,
} from "@/lib/contact-attachments";

describe("attachmentKindFromName", () => {
  it("accepts the allowed extensions, case-insensitively", () => {
    expect(attachmentKindFromName("shot.PNG")).toBe("png");
    expect(attachmentKindFromName("photo.jpeg")).toBe("jpg");
    expect(attachmentKindFromName("server.LOG")).toBe("log");
    expect(attachmentKindFromName("dump.json")).toBe("json");
    expect(attachmentKindFromName("notes.txt")).toBe("txt");
  });

  it("rejects other extensions", () => {
    expect(attachmentKindFromName("evil.exe")).toBeNull();
    expect(attachmentKindFromName("archive.zip")).toBeNull();
    expect(attachmentKindFromName("noext")).toBeNull();
  });
});

describe("validateAttachmentFile", () => {
  it("accepts a valid file", () => {
    expect(validateAttachmentFile("log.txt", 1024)).toEqual({ ok: true, kind: "txt" });
  });

  it("rejects empty names, bad types and oversize files", () => {
    expect(validateAttachmentFile("  ", 10)).toEqual({ ok: false, reason: "name" });
    expect(validateAttachmentFile("x.pdf", 10)).toEqual({ ok: false, reason: "type" });
    expect(validateAttachmentFile("x.txt", MAX_ATTACHMENT_BYTES + 1)).toEqual({
      ok: false,
      reason: "size",
    });
    expect(validateAttachmentFile("x.txt", 0)).toEqual({ ok: false, reason: "size" });
  });

  it("accepts a file exactly at the 5 MiB limit", () => {
    expect(validateAttachmentFile("x.png", MAX_ATTACHMENT_BYTES)).toEqual({ ok: true, kind: "png" });
  });
});

describe("sanitizeAttachmentName", () => {
  it("strips paths and unsafe characters", () => {
    expect(sanitizeAttachmentName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeAttachmentName("C:\\logs\\app log.txt")).toBe("app-log.txt");
    expect(sanitizeAttachmentName("token=abc123 secret.log")).toBe("token-abc123-secret.log");
  });

  it("falls back to a default name and caps length", () => {
    expect(sanitizeAttachmentName("///")).toBe("bijlage");
    expect(sanitizeAttachmentName(`${"a".repeat(200)}.txt`).length).toBeLessThanOrEqual(120);
  });
});

describe("sniffAttachmentKind", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const text = new TextEncoder().encode("2026-11-01 INFO started\n");
  const binary = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

  it("verifies image magic bytes", () => {
    expect(sniffAttachmentKind(png, "png")).toBe(true);
    expect(sniffAttachmentKind(jpg, "jpg")).toBe(true);
    expect(sniffAttachmentKind(jpg, "png")).toBe(false);
    expect(sniffAttachmentKind(text, "png")).toBe(false);
  });

  it("accepts real text for txt/log/json and rejects binaries", () => {
    expect(sniffAttachmentKind(text, "txt")).toBe(true);
    expect(sniffAttachmentKind(text, "log")).toBe(true);
    expect(sniffAttachmentKind(text, "json")).toBe(true);
    expect(sniffAttachmentKind(binary, "txt")).toBe(false);
    expect(sniffAttachmentKind(png, "log")).toBe(false);
  });

  it("rejects empty content", () => {
    expect(sniffAttachmentKind(new Uint8Array(0), "txt")).toBe(false);
  });
});
