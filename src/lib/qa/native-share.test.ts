import { afterEach, expect, it, vi } from "vitest";
import { shareStoryFile, storyFile } from "./native-share";
afterEach(() => vi.unstubAllGlobals());
it("passes the exact generated image bytes to the native share sheet", async () => {
  const blob = new Blob(["image-bytes"], { type: "image/png" });
  const file = storyFile(blob, "rout-story.png");
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { canShare: () => true, share });
  expect(await shareStoryFile(file)).toBe("shared");
  expect(share).toHaveBeenCalledWith({ files: [file] });
  expect(file.size).toBe(blob.size);
  expect(file.type).toBe("image/png");
});
it("distinguishes cancellation from a rejected OS share", async () => {
  const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  vi.stubGlobal("navigator", { canShare: () => true, share });
  expect(await shareStoryFile(storyFile(new Blob(["a"], { type: "image/png" }), "rout.png"))).toBe("cancelled");
  share.mockRejectedValue(new Error("Denied"));
  await expect(shareStoryFile(storyFile(new Blob(["a"], { type: "image/png" }), "rout.png"))).rejects.toThrow("Denied");
});
it("passes a generated video file unchanged to the native share sheet",async()=>{
 const file=storyFile(new Blob(["recorded-video"],{type:"video/webm"}),"rout-story.webm");
 const share=vi.fn().mockResolvedValue(undefined);vi.stubGlobal("navigator",{canShare:()=>true,share});
 expect(await shareStoryFile(file)).toBe("shared");expect(share).toHaveBeenCalledWith({files:[file]});expect(file.size).toBe(14);
});