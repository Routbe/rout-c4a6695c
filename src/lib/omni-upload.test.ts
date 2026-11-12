import { expect, it } from "vitest";
import { decodeGridWebp, GRID_UPLOAD_MAX_BYTES } from "./omni-upload";
it("accepts WebP magic bytes only, not HTML disguised as an image", () => {
  expect(decodeGridWebp(btoa("RIFF0000WEBPbytes"))?.length).toBe(17);
  expect(decodeGridWebp(btoa("<html>tracking</html>"))).toBeNull();
  expect(decodeGridWebp("not base64!")).toBeNull();
});
it("rejects a manual cover over the bounded five-MiB upload limit", () => {
  expect(GRID_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
  expect(decodeGridWebp("A".repeat(Math.ceil(GRID_UPLOAD_MAX_BYTES / 3) * 4 + 4))).toBeNull();
});