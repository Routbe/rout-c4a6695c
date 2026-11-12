import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-fetch.server", () => ({
  assertPublicHost: vi.fn(async (host: string) => {
    // Simuleer DNS: bekende publieke host ok, privé/loopback geblokkeerd.
    if (host === "mastodon.social" || host === "example.org") return true;
    return false;
  }),
}));

import { SsrfBlockedError, validateOutboundUrl } from "./ssrf-guard.server";

describe("validateOutboundUrl", () => {
  it("blokkeert http://localhost keihard", async () => {
    await expect(validateOutboundUrl("http://localhost/admin")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("blokkeert http://127.0.0.1 (loopback)", async () => {
    await expect(validateOutboundUrl("http://127.0.0.1:8080/")).rejects.toThrow(/https/);
  });

  it("blokkeert het cloud-metadata-adres 169.254.169.254", async () => {
    await expect(
      validateOutboundUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      validateOutboundUrl("https://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blokkeert niet-http schema's (file, gopher, ftp)", async () => {
    await expect(validateOutboundUrl("file:///etc/passwd")).rejects.toThrow(/https/);
    await expect(validateOutboundUrl("gopher://internal/")).rejects.toThrow(/https/);
    await expect(validateOutboundUrl("ftp://internal/")).rejects.toThrow(/https/);
  });

  it("blokkeert privé-hosts die via DNS naar binnen resolven", async () => {
    await expect(validateOutboundUrl("https://internal.corp/")).rejects.toThrow(
      /restricted|Invalid/,
    );
  });

  it("blokkeert niet-standaard poorten", async () => {
    await expect(validateOutboundUrl("https://mastodon.social:8443/")).rejects.toThrow(/port/);
  });

  it("laat legitieme externe https-domeinen door", async () => {
    const url = await validateOutboundUrl("https://mastodon.social/api/v1/apps");
    expect(url.hostname).toBe("mastodon.social");
    expect(url.protocol).toBe("https:");
  });

  it("geeft een duidelijke fout bij ongeldige URLs", async () => {
    await expect(validateOutboundUrl("niet-een-url")).rejects.toThrow(/Invalid URL/);
  });
});
