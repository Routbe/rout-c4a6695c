import { expect, test } from "bun:test";
import { renderedMetadata } from "./render";
import { safeFetch } from "./fetch";

test("unapproved renderer hosts are rejected before browser launch or network access", async () => {
  await expect(renderedMetadata("https://unapproved.invalid/story")).rejects.toThrow("unsafe");
});
test("render transport rejects an unapproved redirect destination before DNS resolution", async () => {
  await expect(safeFetch("https://unapproved.invalid/redirect", 1024, 1, new Set(["example.com"]))).rejects.toThrow("unsafe");
});

// Uses the installed sandbox browser; no real network or external data.
test.skipIf(!process.env.CHROMIUM_PATH || process.getuid?.() === 0)("renders SPA metadata while blocking private-network subrequests", async () => {
  const previous = process.env.OMNI_RENDER_HOSTS;
  process.env.OMNI_RENDER_HOSTS = "example.com";
  const urls: string[] = [];
  const transport = async (url: string) => {
    urls.push(url);
    const html = `<html><head><title>Initial</title></head><body><script>
      const meta=document.createElement('meta');meta.setAttribute('property','og:image');meta.content='https://example.com/cover.webp';document.head.append(meta);
      document.title='Rendered SPA';fetch('https://127.0.0.1/private').catch(()=>{});
      fetch('https://localhost/private').catch(()=>{});
      fetch('https://unapproved.invalid/private').catch(()=>{});
    </script></body></html>`;
    return { bytes: Buffer.from(html), type: "text/html", url };
  };
  try {
    const metadata = await renderedMetadata("https://example.com/story", transport);
    expect(metadata).toContain("Rendered SPA"); expect(metadata).toContain("og:image");
    expect(urls).toEqual(["https://example.com/story"]);
  } finally { if (previous === undefined) delete process.env.OMNI_RENDER_HOSTS; else process.env.OMNI_RENDER_HOSTS = previous; }
}, 20000);