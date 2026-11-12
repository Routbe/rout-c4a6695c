import { describe, expect, it } from "vitest";
import { activePresence, readStatusJson, spotlightCandidates, statusInput } from "./presence";
const base = { id: "11111111-1111-4111-8111-111111111111", space: "alias", statusType: "micro_text" };
it("accepts exactly 280 Unicode characters but rejects 281", () => {
  expect(statusInput.safeParse({ ...base, payload: { text: "😀".repeat(280) } }).success).toBe(true);
  expect(statusInput.safeParse({ ...base, payload: { text: "😀".repeat(281) } }).success).toBe(false);
});
it("rejects uploaded media and arbitrary status types", () => {
  expect(statusInput.safeParse({ ...base, payload: { text: "Hi", file: "binary" } }).success).toBe(false);
  expect(statusInput.safeParse({ ...base, statusType: "video", payload: { url: "https://example.com" } }).success).toBe(false);
});
it("disappears exactly at 24 hours, not a moment later", () => {
  const createdAt="2026-11-03T10:00:00Z", expiresAt="2026-11-04T10:00:00Z";
  const stories=[{ id: "a", statusType: "micro_text" as const, text:"Hi", createdAt, expiresAt }];
  expect(activePresence(stories,Date.parse(expiresAt)-1)).toHaveLength(1);
  expect(activePresence(stories,Date.parse(expiresAt))).toHaveLength(0);
});
it("spotlights the existing block id and excludes hidden blocks", () => {
  expect(spotlightCandidates([{id:"existing",kind:"custom",label:"Article",value:"https://example.com"},{id:"secret",kind:"custom",label:"Hidden",value:"https://example.com",hidden:true}]).map(s=>s.blockId)).toEqual(["existing"]);
});
it("refuses multipart and binary even with JSON-like contents", async () => {
  for (const type of ["multipart/form-data; boundary=x", "application/octet-stream", "video/webm"]) {
    await expect(readStatusJson(new Request("https://example.com",{method:"POST",headers:{"content-type":type},body:"{}"}))).rejects.toMatchObject({statusCode:415});
  }
});
describe("pulse styles", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  it("accepts a known background, font, alignment and sticker", () => {
    expect(statusInput.safeParse({ id, space: "root", statusType: "micro_text", payload: { text: "Bored", bg: "sunset", font: "hand", align: "left", sticker: "🔥" } }).success).toBe(true);
  });
  it("rejects unknown style values", () => {
    expect(statusInput.safeParse({ id, space: "root", statusType: "micro_text", payload: { text: "Bored", bg: "url(evil)" } }).success).toBe(false);
    expect(statusInput.safeParse({ id, space: "root", statusType: "micro_text", payload: { text: "Bored", sticker: "<b>" } }).success).toBe(false);
  });
});
