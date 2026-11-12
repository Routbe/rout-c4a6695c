import { test, expect } from "bun:test";
import { publicAddress } from "./fetch";
import { EventHub } from "./events";
import { signOmniTicket } from "../src/lib/omni-realtime";
import { webm } from "./media";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("source fetch rejects private and mapped private addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "fc00::1"]) expect(publicAddress(address)).toBe(false);
  expect(publicAddress("1.1.1.1")).toBe(true);
});
test("SSE pushes only the authenticated owner's job identifier", async () => {
  const hub = new EventHub(); const secret = "test-only-event-secret-more-than-32-chars";
  const owner = "11111111-1111-4111-8111-111111111111";
  const abort = new AbortController();
  const ticket = await signOmniTicket(owner, "https://events.rout.be", secret);
  const request = new Request("https://events.rout.be/events", { method: "POST", headers: { Origin: "https://rout.be", Authorization: `Bearer ${ticket}` }, signal: abort.signal });
  const response = await hub.handle(request, "https://rout.be", "https://events.rout.be", secret);
  expect(response.status).toBe(200);
  const reader = response.body?.getReader(); if (!reader) throw new Error("no_stream");
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: connected");
  hub.publish("22222222-2222-4222-8222-222222222222", "foreign-job");
  hub.publish(owner, "owned-job");
  const event = new TextDecoder().decode((await reader.read()).value);
  expect(event).toContain("owned-job"); expect(event).not.toContain("foreign-job");
  abort.abort(); await reader.cancel();
});
test("SSE rejects missing tickets and foreign origins", async () => {
  const hub = new EventHub();
  expect((await hub.handle(new Request("https://events.rout.be/events", { method: "POST", headers: { Origin: "https://rout.be" } }), "https://rout.be", "https://events.rout.be", "test-only-event-secret-more-than-32-chars")).status).toBe(401);
  expect((await hub.handle(new Request("https://events.rout.be/events", { method: "POST", headers: { Origin: "https://evil.example" } }), "https://rout.be", "https://events.rout.be", "test-only-event-secret-more-than-32-chars")).status).toBe(403);
});
test("native conversion emits a real WebP image and muted bounded WebM", async () => {
  const image = await sharp({ create: { width: 40, height: 30, channels: 3, background: "red" } }).png().toBuffer();
  const result = await sharp(image).webp().toBuffer();
  expect((await sharp(result).metadata()).format).toBe("webp");
  const dir = await mkdtemp(join(tmpdir(), "omni-conversion-test-"));
  try {
    const input = join(dir, "input.mp4");
    const generated = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1", "-c:v", "libx264", input]);
    expect(generated.status).toBe(0);
    const output = await webm(await readFile(input));
    expect([...output.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(output.length).toBeLessThan(4 * 1024 * 1024);
  } finally { await rm(dir, { recursive: true, force: true }); }
});