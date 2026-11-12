import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/altcha.functions", () => ({ getAltchaChallenge: async () => ({ algorithm: "SHA-256", challenge: "hash", salt: "salt?expires=9999999999", signature: "sig", maxnumber: 10, hard: false }) }));
vi.mock("@/lib/crypto-enclave/client", () => ({ enclave: { hash: { sha256Hex: vi.fn() } } }));
import { prefetchProof } from "./altcha-client";
class WorkerStub {
  static current: WorkerStub | null = null;
  static fail = false;
  onmessage: ((event: { data: { number: number } }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { WorkerStub.current = this; }
  terminate() { this.terminated = true; }
  postMessage() { if (WorkerStub.fail) throw new Error("send failed"); }
}
describe("ALTCHA worker lifecycle without a UI fallback", () => {
  beforeEach(() => { vi.useFakeTimers(); WorkerStub.fail = false; vi.stubGlobal("Worker", WorkerStub); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("settles a stalled worker within 120 seconds and allows a later attempt", async () => {
    const proof = prefetchProof();
    const rejected = expect(proof).rejects.toThrow("altcha_worker_timeout");
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(WorkerStub.current?.terminated).toBe(true);
  });
  it("cleans worker and timer when posting the challenge fails", async () => {
    WorkerStub.fail = true;
    await expect(prefetchProof()).rejects.toThrow("altcha_worker_unavailable");
    expect(WorkerStub.current?.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});