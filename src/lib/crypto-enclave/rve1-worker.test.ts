// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runEnclaveOp } from "./enclave-core";
import { createEnclaveDispatcher } from "./dispatch";
import { isEnclaveOp } from "./enclave-core";
import type { EnclaveOp, EnclaveOps, EnclaveResponse } from "./protocol";
import { loadRve1Key } from "./rve1-key-store";

const USER = "00000000-0000-4000-8000-0000000000c1";
async function call<K extends EnclaveOp>(op: K, args: EnclaveOps[K]["req"]): Promise<EnclaveOps[K]["res"]> {
  const r = await runEnclaveOp(op, args);
  if (!r.ok) throw new Error(r.code);
  return r.result as EnclaveOps[K]["res"];
}
const code = async (op: EnclaveOp, args: unknown) => {
  const r = await runEnclaveOp(op, args);
  return r.ok ? "ok" : r.code;
};
const bytesOf = (s: string) => new TextEncoder().encode(s);

async function withDeviceKey(userId: string) {
  const { handle } = await call("masterKey.generate", {});
  await call("masterKey.commitPending", { handle, userId });
}

describe("RVE1 device key inside the worker", () => {
  it("refuses everything before the Master Key unlocked a device key", async () => {
    const other = "00000000-0000-4000-8000-0000000000c9";
    expect(await code("rve1.deviceKey", { userId: other })).toBe("no_device_key");
    expect(await loadRve1Key(other)).toBeNull();
  });

  it("returns only the key id and public key, and stores the seed only sealed", async () => {
    await withDeviceKey(USER);
    const first = await call("rve1.deviceKey", { userId: USER });
    expect(Object.keys(first).sort()).toEqual(["kid", "publicKey"]);
    expect(first.publicKey.length).toBe(1600);
    const again = await call("rve1.deviceKey", { userId: USER });
    expect(again.kid).toBe(first.kid);
    const stored = await loadRve1Key(USER);
    expect(stored?.sealedSeed).toMatch(/^v1\./);
    expect(Object.keys(stored ?? {}).sort()).toEqual(["keyId", "kid", "publicKey", "sealedSeed"]);
  });

  it("seals and opens a vcc_ credential, wiping the plaintext it was handed", async () => {
    const plaintext = bytesOf('{"vct":"rout.age_over_18","value":true}');
    const { envelope } = await call("rve1.seal", { userId: USER, kind: "vcc", purpose: "age_over_18", plaintext });
    expect(plaintext.every((b) => b === 0)).toBe(true);
    const opened = await call("rve1.open", { userId: USER, kind: "vcc", purpose: "age_over_18", envelope: envelope.slice() });
    expect(new TextDecoder().decode(opened.plaintext)).toBe('{"vct":"rout.age_over_18","value":true}');
  });

  it("refuses another purpose, another member, other kinds and tampering", async () => {
    const { envelope } = await call("rve1.seal", { userId: USER, kind: "vcc", purpose: "age_over_18", plaintext: bytesOf("claim") });
    expect(await code("rve1.open", { userId: USER, kind: "vcc", purpose: "nationality", envelope: envelope.slice() })).toBe("decrypt_failed");
    const bob = "00000000-0000-4000-8000-0000000000c2";
    await withDeviceKey(bob);
    expect(await code("rve1.open", { userId: bob, kind: "vcc", purpose: "age_over_18", envelope: envelope.slice() })).toBe("decrypt_failed");
    for (const kind of ["vtk", "sdm", "mpc"]) {
      expect(await code("rve1.seal", { userId: USER, kind, purpose: "x", plaintext: bytesOf("a") })).toBe("invalid_input");
      expect(await code("rve1.open", { userId: USER, kind, purpose: "x", envelope: envelope.slice() })).toBe("invalid_input");
    }
    expect(await code("rve1.seal", { userId: "not-a-uuid", kind: "vcc", purpose: "x", plaintext: bytesOf("a") })).toBe("invalid_input");
    const bad = envelope.slice();
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(await code("rve1.open", { userId: USER, kind: "vcc", purpose: "age_over_18", envelope: bad })).toBe("decrypt_failed");
  });

  it("moves opened plaintext to the UI instead of copying it", async () => {
    const { envelope } = await call("rve1.seal", { userId: USER, kind: "vcc", purpose: "age_over_18", plaintext: bytesOf("claim") });
    const posted: { response: EnclaveResponse; transfer: Transferable[] }[] = [];
    const dispatch = createEnclaveDispatcher(isEnclaveOp, runEnclaveOp, (response, transfer) => posted.push({ response: structuredClone(response, { transfer }), transfer }));
    await dispatch({ id: 1, op: "rve1.open", args: { userId: USER, kind: "vcc", purpose: "age_over_18", envelope } });
    const done = posted.find((p) => "ok" in p.response);
    expect(done?.transfer.length).toBe(1);
    const result = done?.response as { ok: true; result: { plaintext: Uint8Array } };
    expect(new TextDecoder().decode(result.result.plaintext)).toBe("claim");
  });

  it("is reachable from the UI only through the typed client, which wipes after use", () => {
    const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    expect(client).toMatch(/withCredential[\s\S]*finally[\s\S]*plaintext\.fill\(0\)/);
    expect(client).not.toMatch(/from "\.\/(pqc-envelope|rve1-key-store|enclave-core)"/);
  });
});
