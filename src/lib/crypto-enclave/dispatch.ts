import { wipeMessage } from "@/lib/crypto/wipe";
import type { EnclaveErrorCode, EnclaveOp, EnclaveResponse } from "./protocol";

type Outcome = { ok: true; result: unknown } | { ok: false; code: EnclaveErrorCode };

/** An injectable, ordered worker dispatcher; queue and transfer behavior are testable without Web Crypto mocks. */
export function createEnclaveDispatcher(
  isOp: (op: unknown) => op is EnclaveOp,
  run: (op: EnclaveOp, args: unknown) => Promise<Outcome>,
  post: (response: EnclaveResponse, transfer: Transferable[]) => void,
) {
  let queue = Promise.resolve();
  return (input: unknown): Promise<void> => {
    const msg = input as { id?: unknown; op?: unknown; args?: unknown } | null;
    if (!msg || !Number.isSafeInteger(msg.id) || !isOp(msg.op)) {
      wipeMessage(input);
      return Promise.resolve();
    }
    const id = msg.id as number;
    const op = msg.op;
    queue = queue.then(async () => {
      post({ id, started: true }, []);
      const outcome = await run(op, msg.args);
      const response: EnclaveResponse = { id, ...outcome };
      try {
        const transfer: Transferable[] = [];
        if (outcome.ok && (op === "data.open" || op === "protocol.openEvent")) {
          transfer.push((outcome.result as { plaintext: Uint8Array }).plaintext.buffer as ArrayBuffer);
        }
        post(response, transfer);
      } finally {
        wipeMessage(response);
      }
    }).catch(() => {
      try { post({ id, ok: false, code: "internal" }, []); } catch { /* receiver is gone */ }
    }).finally(() => wipeMessage(msg.args));
    return queue;
  };
}