# ROUT ID — Zero-Knowledge Herstelkluis: ontwerp (v2-voorstel)

Status: **ontwerp, nog niet gebouwd**. Wat al live in de code zit staat in §1. Alles vanaf §3 vraagt een akkoord
van de eigenaar voordat er een databasewijziging komt (migraties worden nooit automatisch op Neon gezet).

## 1. Wat er nu al is

| Onderdeel | Waar | Doet |
|---|---|---|
| Hoofdsleutel (24 BIP39-woorden, 256 bit) | `crypto-enclave` op `masterKey.generate` / `masterKey.unlock` | Willekeurige entropie in de worker, HKDF naar de toestel-/workspace-sleutel, niet-extraheerbaar bewaard. |
| Herstelkluis 3-van-5 | `db/0209`, `db/0210`, `src/lib/recovery/*` | Willekeurige kluissleutel versleutelt de hoofdsleutel (AES-256-GCM); de kluissleutel wordt Shamir-gesplitst in 5 scherven; ROUT bewaart er max. 2, elk verpakt met de passkey-PRF (HKDF → AES-GCM). |
| Step-up | `step-up-guard.server.ts` | Aanmaken, vernieuwen, scherven opslaan en verwijderen vragen een verse passkey-bevestiging. |
| Audit | `security_audit_logs` (`db/0127`) | Hash-geketend; sinds nov. 2026 schrijft de kluis elke wijziging en elk herstel weg (`recovery_vault.*`). |
| Noodkit | `src/lib/recovery/emergency-kit.ts` | PDF met de 24 woorden + QR, of met de 2FA-herstelcodes, volledig in de browser gemaakt. |

Herstel zelf vraagt bewust **geen** step-up: wie herstelt, is zijn toestel en passkey vaak net kwijt. In de plaats
daarvan komen er rate limits, meldingen naar de eigenaar en (voorstel §5) een wachttijd.

## 2. Waarom geen Rust/WASM nodig is

`@noble/hashes` (Argon2id, HKDF, SHA-2/3), WebCrypto AES-GCM en `@scure/bip39` zijn geaudit of standaard, zonder afhankelijkheden
en draaien al in de worker. Een WASM-module voegt een tweede build-toolchain (cargo + wasm-pack) toe die de
Lovable-build niet uitvoert, dus het `.wasm`-bestand zou als vooraf gebouwd binair bestand in de repo moeten staan.
Dat is moeilijker te controleren dan TypeScript-broncode. Aanbeveling: **pure TypeScript in de worker**. Alleen als
Argon2id met veel geheugen (≥ 256 MiB) te traag blijkt, kan WASM. Mappenstructuur in dat geval:

```text
crates/rout-vault/            Cargo-crate (niet door de app-build uitgevoerd)
  Cargo.toml
  src/lib.rs                  wasm-bindgen exports: argon2id(), seal(), open()
  src/kdf.rs  src/container.rs
  tests/vectors.rs            dezelfde testvectoren als de TS-tests
src/lib/crypto-enclave/wasm/
  rout_vault_bg.wasm          vooraf gebouwd, reproduceerbaar (Docker + vaste rustc)
  rout_vault.js               wasm-bindgen glue
  checksum.test.ts            faalt als de .wasm niet overeenkomt met SHA-256 in CHECKSUM
scripts/build-vault-wasm.sh   enige plek waar cargo/wasm-pack draait
```

De worker laadt de module met `import init from "./wasm/rout_vault.js?init"` (alleen in `crypto.worker.ts`, nooit in SSR).

## 3. Cryptografisch datamodel (voorstel)

```text
Herstelzin (24 woorden, 256 bit)
  └─ entropie E (32 B)
       ├─ HKDF-SHA256(E, "rout.device.v1")              → toestelsleutel (bestaat al)
       └─ Argon2id(E, salt_p, m=64 MiB, t=3, p=1) → 32 B
            └─ HKDF-SHA256(·, info="rout.vault.wrap.phrase.v1|<vault_id>") → KEK_phrase

Passkey (WebAuthn PRF, per credential)
  └─ PRF(salt_prf) → 32 B → HKDF(info="rout.vault.wrap.prf.v1|<vault_id>|<cred_id>") → KEK_prf

Kluissleutel VK = 32 willekeurige bytes (nooit opgeslagen in klare vorm)
  wrap_phrase = AES-256-GCM(KEK_phrase, VK, aad = "rout.vault.v2|<vault_id>|phrase")
  wrap_prf    = AES-256-GCM(KEK_prf,    VK, aad = "rout.vault.v2|<vault_id>|prf|<cred_id>")
  shards      = Shamir 3-van-5 over VK (bestaand, optioneel naast de wraps)

Container C = vaste grootte 64 KiB
  header (versie, nonce) ‖ AES-256-GCM(VK, slot_A ‖ slot_B ‖ random padding)
```

Opslag bij ROUT (alleen ciphertext + salts): `vault_id`, `version`, `salt_p`, `salt_prf` per credential,
`wrap_*`, container `C`, mutatielog. Nooit: woorden, E, VK, KEK's, klare kluisinhoud.

**Salts en OPAQUE.** De zin heeft 256 bit entropie; met of zonder geheime salt valt hij niet te raden. Argon2id is hier
verdediging-in-de-diepte, geen noodzaak. OPAQUE (een PAKE) is bedoeld om *zwakke* wachtwoorden te beschermen tegen
een server die salts lekt. Het heeft pas zin als we een door de gebruiker gekozen pincode/wachtwoord als extra laag
toevoegen. Voorstel: geen OPAQUE voor de 24 woorden; wél OPAQUE (bv. `@serenity-kit/opaque`, na audit-check) als er
ooit een "kluis-pincode" komt.

## 4. Decoy-kluis en verborgen kluis

Elke container heeft altijd twee slots van gelijke grootte en wordt volledig opgevuld met willekeurige bytes; wie
alleen de ciphertext ziet, kan niet zien of slot B gebruikt wordt. Slot A opent met de gewone zin, slot B met een
tweede, aparte zin ("verborgen kluis"). Een **dwangzin** opent slot A en kan optioneel een stil alarm in de audit
zetten.

Eerlijke grenzen: ontkenbaarheid werkt alleen als *iedere* kluis slot B heeft en ROUT nergens (UI, logs, timing,
grootte) verraadt of B ooit geopend is. Een aanvaller die weet dat ROUT verborgen kluizen ondersteunt, kan om beide
zinnen vragen; techniek kan dwang niet wegnemen, alleen geloofwaardig maken dat er niets meer is.

## 5. Herstel met wachttijd en Merkle-getuigen

* **Wachttijd**: een echt herstel opent pas na een wachttijd (voorstel 72 uur, eigenaar kiest 24–168 u). Tijdens die
  tijd krijgt de eigenaar meldingen op elk kanaal en kan hij met eender welke actieve factor annuleren. Uitbreiding van
  `auth_recovery_requests` (`db/0207`, live) met `vault_release_at`, `cancelled_at`.
* **Merkle-transparantie**: elke kluiswijziging wordt een blad `H(canonieke JSON)` in een append-only boom; de
  dagelijkse kop wordt ondertekend (zoals de bestaande `security_audit_checkpoints`). De browser vraagt voor zijn
  eigen wijzigingen een inclusiebewijs en bewaart de laatste kop, zodat een server die geschiedenis herschrijft
  opvalt.

Voorstel-schema (nieuwe migratie, volgend vrij nummer, **niet aangemaakt**): `recovery_vault_wraps`,
`recovery_vault_containers` (`check (octet_length(blob) = 65536)`), `recovery_vault_log` (append-only, trigger zoals
`db/0127`). Alles RLS aan, geen directe grants aan `rout_app`; toegang alleen via `security definer`-functies die
zelf `rout_current_user_id()` vergelijken met de rij (de huidige 0209-functies vertrouwen op de server-call-site;
dat trekken we in dezelfde migratie recht).

## 6. Dreigingsmodel

| Dreiging | Wat de aanvaller krijgt | Waarom het houdt / wat niet |
|---|---|---|
| **Volledig servercompromis** (DB + code) | Ciphertext, salts, wraps, auditlog | Geen woorden, E of VK: 256-bit zin + Argon2id. **Niet beschermd**: een aanvaller die de *code* aanpast, kan kwaadaardige JS serveren die de zin bij de volgende invoer steelt. Tegenmaatregel: SRI, ondertekende builds, Merkle-kop vergelijken, op termijn een aparte `vault.rout.be`-oorsprong met strikte CSP. |
| **Kwantumcomputer** | — | AES-256-GCM en SHA-256/Argon2id houden ~128 bit tegen Grover. Shamir is informatietheoretisch veilig. Kwetsbaar: ECDSA/P-256 van passkeys (authenticatie, niet vertrouwelijkheid) en elke toekomstige ECDH-sleuteluitwisseling; daar hybride X25519 + ML-KEM (`@noble/post-quantum`, nu in gebruik in `crypto-enclave/pqc-envelope.ts`; het oude `db/0204`-ontwerp staat gearchiveerd in `db-archive/`). |
| **XSS** | Alles wat de pagina ziet | De worker is geen XSS-grens (zie `crypto-enclave/SECURITY.md`): ingespoten script kan de zin lezen terwijl hij op het scherm staat, of de worker zelf aanroepen. Beperking: strikte CSP + Trusted Types, zin kort tonen, invoer op aparte oorsprong (voorstel). |
| **Fysieke dwang** | Wat het slachtoffer afgeeft | Dwangzin opent de decoy-kluis; wachttijd + meldingen geven tijd om te annuleren of het account te bevriezen. Geen bescherming als beide zinnen worden afgedwongen. |
| **Gestolen toestel** | Toestelsleutel achter OS-vergrendeling | Nieuwe zin/herstel vraagt step-up; herstel heeft wachttijd en meldingen. |
| **Kwaadwillige ROUT-medewerker** | Zelfde als servercompromis | Max. 2 van 5 scherven bij ROUT; Shamir-drempel 3. |
| **Phishing** | Zin als het slachtoffer hem intypt | Passkeys zijn phishing-bestendig; de zin niet. UI en noodkit zeggen dat ROUT er nooit om vraagt. |

## 7. Open beslissingen voor de eigenaar

1. Mag de nieuwe migratie (§5) worden geschreven en daarna, na review, op Neon toegepast?
2. Wachttijd: standaard 72 uur? Annuleren met elke factor of alleen passkey?
3. Verborgen kluis en dwangzin: bouwen, of eerst alleen de vaste-grootte container?
4. Kluis-pincode met OPAQUE: gewenst?
