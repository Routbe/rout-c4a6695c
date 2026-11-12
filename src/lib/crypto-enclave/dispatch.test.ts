// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEnclaveDispatcher } from "./dispatch";
import type { EnclaveOp, EnclaveResponse } from "./protocol";
const isOp = (op: unknown): op is EnclaveOp => op === "data.open" || op === "hash.sha256Hex";

describe("real worker dispatch queue", () => {
  it("runs in order and announces execution without leaking or copying returned plaintext", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const responses: EnclaveResponse[] = [];
    const plaintext = new Uint8Array([65, 66]);
    const dispatch = createEnclaveDispatcher(isOp, async (op) => {
      calls.push(op);
      if (op === "data.open") { await gate; return { ok: true, result: { plaintext } }; }
      return { ok: true, result: "digest" };
    }, (response, transfer) => { responses.push(structuredClone(response, { transfer })); });
    const first = dispatch({ id: 1, op: "data.open", args: {} });
    const second = dispatch({ id: 2, op: "hash.sha256Hex", args: { text: "x" } });
    await Promise.resolve();
    expect(calls).toEqual(["data.open"]);
    expect(responses).toEqual([{ id: 1, started: true }]);
    release?.();
    await Promise.all([first, second]);
    expect(calls).toEqual(["data.open", "hash.sha256Hex"]);
    expect(plaintext.byteLength).toBe(0);
    const response = responses[1];
    if (!("ok" in response) || !response.ok) throw new Error("No plaintext reply");
    expect([...(response.result as { plaintext: Uint8Array }).plaintext]).toEqual([65, 66]);
    expect(responses[2]).toEqual({ id: 2, started: true });
  });
  it("zeroes failed response bytes and keeps the queue usable", async () => {
    const plaintext = new Uint8Array([10, 20]);
    const errors: EnclaveResponse[] = [];
    const dispatch = createEnclaveDispatcher(isOp, async (op) => ({ ok: true, result: op === "data.open" ? { plaintext } : "hash" }), (response) => {
      if ("ok" in response && response.ok && response.id === 1) throw new Error("send failed");
      errors.push(response);
    });
    await dispatch({ id: 1, op: "data.open", args: {} });
    expect([...plaintext]).toEqual([0, 0]);
    expect(errors).toContainEqual({ id: 1, ok: false, code: "internal" });
    await dispatch({ id: 2, op: "hash.sha256Hex", args: {} });
    expect(errors).toContainEqual({ id: 2, ok: true, result: "hash" });
  });
});