import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { terminateEnclave } from "@/lib/crypto-enclave/client";
import { useCryptoLifecycle } from "./useCryptoLifecycle";
afterEach(() => { cleanup(); terminateEnclave(); });
describe("local crypto cancellation", () => {
  it("aborts local HTTP/WebAuthn on lock and on unmount", () => {
    const view = renderHook(useCryptoLifecycle);
    const first = view.result.current.capture();
    act(() => view.result.current.invalidate());
    expect(first.signal.aborted).toBe(true);
    expect(first.isUiCurrent()).toBe(false);
    const next = view.result.current.capture();
    expect(next.signal.aborted).toBe(false);
    view.unmount();
    expect(next.signal.aborted).toBe(true);
  });
  it("distinguishes a worker failure from leaving the current UI session", () => {
    const view = renderHook(useCryptoLifecycle);
    const scope = view.result.current.capture();
    terminateEnclave();
    expect(scope.isCurrent()).toBe(false);
    expect(scope.isUiCurrent()).toBe(true);
    expect(scope.signal.aborted).toBe(true);
  });
});