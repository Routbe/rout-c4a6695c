import { describe, expect, it } from "vitest";
import { resolveWorkspaceIcon } from "./workspace-icons";

describe("workspace icon", () => {
  it("follows the category when nothing was chosen", () => {
    expect(resolveWorkspaceIcon(null, "event")).toBe("calendar");
    expect(resolveWorkspaceIcon(null, "nonprofit")).toBe("hand-heart");
  });
  it("a chosen icon wins over the category", () => {
    expect(resolveWorkspaceIcon("music", "business")).toBe("music");
  });
  it("falls back to the building for unknown input", () => {
    expect(resolveWorkspaceIcon("evil<script>", null)).toBe("building");
  });
});
