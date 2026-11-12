// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
import { getRequest } from "@tanstack/react-start/server";
import { registerBackgroundTask } from "./background-task.server";
afterEach(() => vi.mocked(getRequest).mockReset());

it("registers ongoing mail with the active Worker request", () => {
  const waitUntil = vi.fn();
  const request = Object.assign(new Request("https://rout.be"), { runtime: { cloudflare: { context: { waitUntil } } } });
  vi.mocked(getRequest).mockReturnValue(request);
  const task = Promise.resolve();
  expect(registerBackgroundTask(task)).toBe(true);
  expect(waitUntil).toHaveBeenCalledWith(task);
});

it("does not claim background registration without a request context", () => {
  vi.mocked(getRequest).mockImplementation(() => { throw new Error("no request"); });
  expect(registerBackgroundTask(Promise.resolve())).toBe(false);
});