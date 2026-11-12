## Protocol ledger rules
- Signing secrets (identity key) exist only in the enclave worker, sealed under the device key in IndexedDB `rout-protocol`; UI code uses `enclave.protocol.*` or `ledger-client.ts`, never `identity-store.ts`. Why: no key on the UI thread, and no signing without an unlocked Master Key.
- Every signature is domain-separated (`rout.event.v1`, `rout.zcap.v1`; DPoP is a standard EdDSA JWS). Why: a signature for one purpose can never be replayed as another.
- Capabilities only attenuate: same target, covered actions, shorter or equal lifetime (max 30 days), ≤ 5 links; `stream.genesis` and `cap.revoke` are never delegable; revocation is a controller-signed `cap.revoke` event. Why: an agent can never hold more than the human gave it, and revocation is itself auditable.
- Clients re-verify the full chain (`verifyChain`) before decrypting anything they read. Why: the server is not trusted with integrity either.
