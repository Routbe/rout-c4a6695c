/// <reference lib="webworker" />
/**
 * Cryptographic enclave worker: the only browser context that performs Web
 * Crypto key operations. The UI talks to it exclusively through postMessage
 * (see client.ts / protocol.ts) and only ever receives ciphertext, public key
 * ids, display-safe summaries or plaintext it explicitly asked to decrypt.
 */
import { isEnclaveOp, runEnclaveOp } from "./enclave-core";
import type { EnclaveRequest, EnclaveResponse } from "./protocol";
import { createEnclaveDispatcher } from "./dispatch";

declare const self: DedicatedWorkerGlobalScope;

// Ordered execution prevents identity creation, key activation and locking
// from overtaking each other across asynchronous Web Crypto operations.
const dispatch = createEnclaveDispatcher(isEnclaveOp, runEnclaveOp, (response: EnclaveResponse, transfer) => self.postMessage(response, transfer));
self.onmessage = (event: MessageEvent<EnclaveRequest>) => {
  void dispatch(event.data);
};
