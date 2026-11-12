# Browser cryptography boundary

## Verified behavior

- React receives public metadata, ciphertext and opaque handles, not derived/private CryptoKeys or raw entropy. WebAuthn PRF bytes are immediately transferred by the browser adapter, never returned to React.
- Dedicated module worker performs device-key derivation, AES-GCM encryption/decryption, vault handoff, ledger key operations, signing and chain verification. ALTCHA puzzle hashing retains its separate worker with no main-thread fallback.
- Owned sensitive byte views are zero-filled on success and failure, including malformed messages and failed transfers. Decrypted bytes move back to the display adapter, which zero-fills them after decoding.
- Pending master keys are non-extractable; entropy is wiped before replying. Pending vault configuration is retained as ciphertext. Absolute deadlines are checked in addition to cleanup timers.
- Worker requests execute in order through a tested dispatcher. Execution-start/progress replies give each request its own 120-second execution budget and refresh queued requests' inactivity budget. A genuinely stalled worker is terminated. Persisted device-key writes already committed cannot be rolled back by termination.
- Logout and observed account changes synchronously terminate volatile crypto state and abort captured HTTP scopes. Persisted device keys remain on this device; logging out is not device erasure. UI sessions are keyed by owner, ignore stale crypto completions, dispose late generated handles, and never reuse another owner's retry ciphertext.
- Local lock/unmount aborts HTTP and WebAuthn scopes. PRF handoff checks the caller's lifecycle before unlocking, cleanup never creates a replacement worker, and mounted UI controls recover from worker failures instead of staying busy. Cleanup is fenced to its originating worker generation.
- Recovery unlock decodes BIP39 entropy only once. Owned Shamir coefficient/share buffers and key-generation failure buffers are zero-filled. Generic encryption rejects input that cannot fit the existing ciphertext format; signed private events pass the same verification as public events before leaving the worker.
- Existing external ciphertext formats, HKDF labels, AAD and IndexedDB slots remain compatible.

## Limits

A browser Web Worker is not a hardware enclave or a security boundary against same-origin XSS. Same-origin JavaScript can invoke the worker API and access origin storage. Non-extractability prevents API key export, not unauthorized use of an accessible key. Recovery phrases/codes, pasted handoff secrets and rendered plaintext are immutable strings visible to the UI; they cannot be reliably wiped. WebAuthn itself requires the main context. JavaScript engines and native Web Crypto can hold inaccessible copies, so zero-fill is best-effort, not guaranteed physical-memory erasure.

The existing agent vault provisioning endpoint receives the configuration and generates its temporary secret server-side. This change improves browser isolation and ciphertext storage, not server blindness at provisioning. Migrating provisioning or authentication is outside this change.

## Verification scope

83 focused tests cover real cryptographic compatibility, zeroing, expired handles (including expiry during an asynchronous device lookup), malformed messages, queue deadlines, timeout termination, failed sends, auth transitions, owner-specific retries, late UI replies and passkey ownership. Chromium verification forbids all main-context SubtleCrypto methods while exercising device-key creation/persistence, encryption/decryption, signed event verification, tamper rejection, transfer detachment, cancellation and worker restart. An independently generated fixed-input vault fixture verifies claim-proof derivation, metadata-only opening, re-encryption and one-time reseal with the existing wire format.

For the protocol/ALTCHA import workflow, Vite development-served main-thread modules fell from 10 to 2; the most recent measured size was 28,540 bytes versus the 847,775-byte baseline (including development transforms). This is not a minified production bundle measurement. Production bundle reduction has no comparable baseline/artifacts in this environment and remains unverified.

Authenticated Neon create/read verification remains blocked by the original ROUT account/signing configuration. No account, permission, schema or Neon record is changed by this work. Automatic build/type diagnostics, not a manually invoked TypeScript build, validate the application.