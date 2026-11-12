import { expect, it } from "vitest";
import { storageFailureCode, storageNetworkCode } from "./storage-errors";
it("recognizes access and bucket errors without returning arbitrary provider text", () => {
  expect(storageFailureCode("<Code>AccessDenied</Code>")).toBe("AccessDenied");
  expect(storageFailureCode("<Code>NoSuchBucket</Code>")).toBe("NoSuchBucket");
  expect(storageFailureCode("<Code>arbitrary</Code>")).toBe("StorageRejected");
});
it("recognizes DNS failures without logging network messages", () => {
  expect(storageNetworkCode({cause:{code:"ENOTFOUND"}})).toBe("DnsFailure");
  expect(storageNetworkCode(new Error("private endpoint"))).toBe("NetworkFailure");
});