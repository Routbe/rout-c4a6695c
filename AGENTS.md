<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Imported ROUT application
- Preserve the source TanStack routes, providers, assets, and MDX catalog so the original app remains compatible.
- Preserve managed project metadata when importing source; register generated backend integrations and their auth attachment only when this project has its own backend connected. Why: the app signs in through its own auth, and a missing backend connection breaks every page that calls the server.
- Keep imported compiler options and MDX compilation while retaining the managed deployment target so source code compiles in this environment.
- Never copy source credentials or apply external database scripts automatically; original accounts and services require explicit compatible configuration.

## Browser cryptography
- Browser encryption, protocol verification and private-key operations use the existing typed crypto-enclave worker with ordered requests, transferred buffers and no UI fallback; shared crypto helpers may still run in server-only handlers. Why: preserves ciphertext compatibility without exposing derived keys to React.
- Zero-fill owned secret/plaintext byte views in finally, hold pending master keys non-extractably and retain vault configuration only as ciphertext; recovery strings/WebAuthn input and engine-internal copies are not erasable or XSS-isolated. Why: cleanup must be testable without claiming a hardware enclave.
- Worker dispatch announces execution start for per-operation deadlines; auth changes terminate volatile state and invalidate captured crypto/HTTP scopes, while owner-keyed UI sessions reject stale completions and preserve persisted device keys. Why: logout, queue delays and late replies must not revive keys or another owner's plaintext.

## Interface materials
- Keep workspace material preferences separate from colour mode; activate root data-theme only for authenticated tools and QR/Studio routes, including their portals, and exclude profile/QR/export artwork. Why: the public gateway retains the imported appearance and Creator restores legacy materials without altering user designs.

## Discover pages
- Product landing pages live at /discover/<topic>; slugs, main buttons and detail links come from src/lib/discover/topics.ts and per-locale copy from copy.<locale>.ts, with accents in src/styles/discover.css. Why: one source keeps the home page, detail-page buttons and sitemap pointing at the same product pages instead of the sign-in wall.

## Vault enclave
- Raw identifiers live only as sealed 'RVE1' envelopes in the vault_enclave schema (db/0221); rout_app has no table rights and reaches it only through register_step_up_proof, store_opaque_token and retrieve_opaque_token, with the caller taken from the transaction context. Why: a compromised app role can neither read ciphertext in bulk nor act for another member.
- Outside the vault, data travels only as opaque refs validated by src/lib/vault/token-boundary.ts; refs are minted by the database, never by callers. Why: one strict boundary keeps raw values out of the browser, logs and APIs.
- Vault retrieval needs p_step_up_verified plus a passkey proof registered on the database clock, used once within 300 s; denials return granted=false instead of raising so their audit row commits. Why: a bare boolean is forgeable, and failed attempts must stay on the hash-chained audit log.
- vault_enclave is in the schema snapshot but gets no generated row types. Why: drift stays detectable while app code has no typed path to the tables.
- Vault access goes through IVaultPort (src/lib/vault/vault-port.server.ts); swap adapters only in vaultPort(). The port moves sealed envelopes and never decrypts. Why: the Postgres adapter must be replaceable 1:1 by a remote enclave client.
- RVE1 envelopes (crypto-enclave/pqc-envelope.ts) fix the allowed key holder per token kind and bind each envelope to a context string naming owner and purpose. Why: a ciphertext moved to another member, field or holder must not open.
- A passkey step-up registers its proof id in the vault at grant time; vault reads use the passkey-only, single-use action vault_token_read. Why: freshness is measured on the database clock from the moment the passkey was verified.
- The Master KEK (ROUT_VAULT_KEK, read per call in server-vault.server.ts) only wraps the server vault's RVE1 seed with AES-256-GCM; wrapped seeds live in vault_enclave.server_keys (db/0222) and a wrap that does not authenticate under the KEK is never used. Why: neither the database nor the environment alone can open vtk_/sdm_.
- vcc_ envelopes are sealed and opened only by the crypto worker's rve1.* ops with a device key whose seed is sealed under the device key; the UI gets plaintext only through enclave.rve1.withCredential, which wipes it after the callback. Why: private keys never reach the main thread and plaintext is short-lived.
- Archived migrations live in db-archive/, never in db/. Why: every file in db/ is replayed by the runner and the snapshot check.

## Legacy runtime access
- The free `rout_server` policies from db/0154 are removed table by table, only after every runtime read/write is moved into the owner's context or a narrow SECURITY DEFINER function; account purge deletes rely on `public.rout_purge_due(user_id)`. Why: dropping them all at once stops sign-in, payments and admin, and the purge runs without a member context.
