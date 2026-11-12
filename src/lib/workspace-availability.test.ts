import { expect, it } from "vitest";
import { unavailableWorkspaceContext } from "./workspace-availability";
it("unavailable context grants no workspace or role and is not successful personal scope", () => {
  const result = unavailableWorkspaceContext();
  expect(result.available).toBe(false);
  expect(result.workspaces).toEqual([]);
  expect(result.activeWorkspaceId).toBeNull();
  expect(result.activeRole).toBeNull();
});