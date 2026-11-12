import { describe, expect, it } from "vitest";
import { assertPublicHost, ipBlocked, safePublicFetch } from "./safe-fetch.server";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks internal address %s",
    (ip) => expect(ipBlocked(ip)).toBe(true),
  );
  it("allows a public address", () => expect(ipBlocked("93.184.216.34")).toBe(false));
  it.each(["localhost", "printer.local", "metadata.internal", "169.254.169.254", "2130706433", "0x7f000001"])(
    "refuses host %s without any request",
    async (host) => expect(await assertPublicHost(host)).toBe(false),
  );
  it("refuses non-http schemes", async () => {
    expect(await safePublicFetch(new URL("file:///etc/passwd"))).toBeNull();
    expect(await safePublicFetch(new URL("gopher://example.com"))).toBeNull();
  });
  it("refuses the cloud metadata endpoint", async () => {
    expect(await safePublicFetch(new URL("http://169.254.169.254/latest/meta-data"))).toBeNull();
  });
});
