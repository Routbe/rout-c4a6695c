import { expect, it } from "vitest";
import { unavailableImageResponse } from "./image-placeholder";
it("returns a non-cacheable first-party image without a remote redirect", async () => {
  const response=unavailableImageResponse();
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-type")).toBe("image/svg+xml");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-rout-image-status")).toBe("unavailable");
});