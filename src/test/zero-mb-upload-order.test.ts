import { describe, expect, it, vi } from "vitest";

// A free workspace has 0 MB: the upload must be refused with the quota message,
// even when file storage itself is not configured (no "storage not set up" instead).
vi.mock("@/lib/neon", () => ({ sql: vi.fn(async () => []) }));
vi.mock("@/lib/entitlement-engine.server", () => ({
  checkActiveScopeUpload: vi.fn(async () => ({ ok: false, status: 403, error: "Storage Quota Exceeded" })),
}));
vi.mock("@/lib/storage/s3.server", () => ({
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  SHARE_TYPES: ["image/png"],
  deleteObject: vi.fn(),
  extFor: () => "png",
  presignedGetUrl: vi.fn(),
  putObject: vi.fn(),
  sniffType: () => "image/png",
  storageConfigured: () => false,
}));

import { STORAGE_QUOTA_MESSAGE, uploadAsset } from "@/lib/assets.server";

describe("upload in a 0 MB workspace", () => {
  it("is refused with the Storage Quota Exceeded message before the storage check", async () => {
    await expect(uploadAsset({ userId: "u1", bytes: new Uint8Array([1, 2, 3]), fileName: "a.png" }))
      .rejects.toThrow(STORAGE_QUOTA_MESSAGE);
    expect(STORAGE_QUOTA_MESSAGE).toContain("Storage Quota Exceeded");
  });
});
