# Roadmap
- [x] ROUT-kaart: beveiligingspaneel (verifiëren, verbergen, blokkeren, vervangen, Google Wallet-sleutel)
- [x] Contactkaart-knop weg, "beweeg je telefoon" alleen op touch-toestellen, slepen op desktop
- [x] Startpagina: 2 profielkaarten + 1 privé ROUT-kaart
- [x] Command Center-widget met status en snelle acties
- [ ] Volledige beveiligingsdoorlichting van het portaal (diepe scan loopt; daarna bevindingen oplossen op risico)
- [x] Zero-trust scan: /s/<token> → /kaart/<token> toont alleen "// VERIFICATIE VEREIST" en vraagt passkey/2FA vóór data (geen extra /c/-adres: /s/ en /v/ dekken dit, een derde ingang vergroot alleen het aanvalsoppervlak)
- [x] Kaart-API: 401 "Step-Up Required" (max 5 min) voor geheimen, bevriezen, blokkeren, vervangen; oude serial meteen bevroren
- [x] Bevriezen (tijdelijk, terug te draaien) naast blokkeren; live status ACTIEF / GEBLOKKEERD / BEVROREN
- [ ] Beheer-weergave in vlakke obsidian-stijl met 1px raster en "//"-accenten
- [x] Regeltests: 2FA verplicht, step-up 5 min, oude serial ongeldig na vervangen, juiste wallet-kaart
- [ ] Ingelogd testen van de kaart-flows: testaccount rout-test-kaart2 gemaakt (passkey werkt); wacht op akkoord om het als geverifieerd te markeren
- [ ] Na testen: beide testaccounts (rout-test-kaart, rout-test-kaart2) verwijderen na akkoord
- [x] Command Center-kaartwidget: teksten in NL/EN/FR/DE
- [ ] Google Wallet echt testen (wacht op Google Wallet- en WALLET_ID_SECRET-sleutels)
- [x] Eigen code-doorlichting beveiliging (wallet, kaart, auth, API) naast de scan — kaartcodes gebonden aan kaart, bevestigingen eenmalig, vervangen atomisch
- [x] Voorkant-code nu 6 cijfers + limiet per kaart en per IP
- [ ] Bevestiging aan sessie binden (uitgesteld: passkey-bevestiging kan de sessie vervangen; bevestiging is al aan gebruiker + handeling gebonden, eenmalig, 2 min)
- [x] Knoppen leesbaar overal (o.a. Google Wallet-knop bij Wallet/profielkaarten) — Wallet-knoppen, verwijderknop Mijn gegevens, statusschakelaar
- [ ] Twee stijlen op elke pagina: hoofdstijl (rustig, klassiek, fysieke knop met indruk-effect en schaduw) standaard + glasstijl (luxe); ontbrekende stukken en status-schakelaar die buiten kader valt
- [ ] Alle widgets nakijken
- [x] Deelafbeeldingen (Snapchat e.a.): nette standaardkaders; anoniem bericht = NGL-stijl "stuur me een anoniem bericht" (ook steun, fooi, afspraak)
- [ ] Profiel-deelafbeelding midden-veilig maken voor vierkante uitsnede
- [ ] Profielhub-pagina's betere ervaring
- [ ] Nederlands nakijken op alle pagina's, vooral hoofdpagina; ontbrekende info op hoofdpagina aanvullen
- [ ] Beveiliging nakijken van agenda en andere onderdelen (afspraken, boekingen, gedeelde links)
- [ ] Koppelingen/live-integraties nakijken: koppelen werkt overal; live-blokken alleen zichtbaar bij actief of zeer recent (muziek, nieuwe post, bewerken, spelen)
- [ ] Studio diepgaand nakijken: indicatoren (bv. "verborgen") niet buiten kader of afgesneden
- [x] Workspace-studio: knop heet "Workspace QR-code" en opent meteen de QR van die workspace
- [ ] Hoofdstijl = strakke klassieke toets (geen gloed, harde schaduwrand + indruk-effect); glasstijl echt glas; knopvormen veranderen mee
- [x] Onthouden welke pagina laatst open was (privé of geverifieerd)
- [x] ROUT-badge klopt niet altijd: badge op externe sites volgt nu dezelfde regel als het profiel (geen vinkje/schild zonder verificatie, verborgen badge = neutraal, privé/geblokkeerd = niet gevonden, korte cache)
- [x] AI-agent sandbox: MCP-tools zonder login, live end-to-end getest op Neon (rout_app-rol)
- [x] Wees-data: agent-workspaces en sandbox-sleutels leven 24 uur; opruimen bij elke nieuwe sandbox + bestaande cron-route
- [x] Rate limit: max 5 sandbox-registraties per IP per uur (plus 5 per IP per 24 u in de database)
- [ ] Claim-flow live testen als ingelogde gebruiker (wacht op BETTER_AUTH_SECRET)
- [ ] Neon-verbinding omzetten naar rout_app-account (nu nog neondb_owner; app schakelt per transactie wel naar rout_app)
- [x] Workspace-slug: draft-username mist het achtervoegsel dat de database aan de slug toevoegt
- [x] Workspace QR-code: knop "Profiel-QR-code" hernoemen en bewaarde workspace-QR laden
- [x] Studio onthoudt laatst gekozen privé/geverifieerd
- [x] ROUT-badge: "badge verbergen" respecteren op externe sites en deelafbeelding
- [x] Doneerpagina en etalage: zelfde badge-regel; doneerpagina toont geen wettelijke naam bij privacy-schild en niets bij privé-profiel
- [x] Kleine Studio-labels ("Verborgen") binnen hun kader houden
- [ ] Glasstijl verbeteren
- [x] Kaartteksten EN/FR/DE (beveiligingsvak, kaartvenster, scanpagina, bevestigvenster, Steam/Last.fm, Studio)
- [ ] Ingelogde kaarttest: bevriezen, blokkeren, vervangen, scanpagina, widget
- [x] Testen live-blokken en afspraakbevestiging uitgevoerd (55 geslaagd)
- [x] Accounts samenvoegen: database-samenvoeging weigert nu als het tweede account nog kaart-, wallet-, herstel- of ouderrecords heeft (migratie 0215, nog niet op live Neon toegepast)
- [x] Migraties 0214 en 0215 op live Neon toegepast en gecontroleerd
- [x] Overige wachtende migraties: 0205–0207 en 0213 geregistreerd, 0204 gearchiveerd
- [x] Ontdek-pagina's: per onderdeel een eigen landingspagina (Profielen, QR Studio, Links & statistieken, ROUT ID, ROUT-kaart, Steun voor makers, Vragen & stories, Workspaces, Developers) met illustraties, effecten en links naar de detailpagina's, in NL/EN/FR/DE
- [x] Hoofdpagina na de kop: meer visuele effecten (Neon-stijl met eigen zwier), onderdelen-overzicht als beeldtegels, knoppen naar de nieuwe Ontdek-pagina's i.p.v. inlogscherm
- [x] Detailpagina's (docs): knop "Open ROUT Studio" is vervangen door link naar het onderdeel (klaar); vaste Nederlandse teksten ("Zo werkt het", "Veelgestelde vragen", "Verder met ROUT") nog vertalen

## Nieuwe vraag (11-11): 2FA, herstelsleutel, verificatieknop, Studio-concept
- [x] ROUT-kaart: gebruiker met actieve tweestapsverificatie krijgt toch "zet eerst 2FA aan"
- [x] Herstelsleutel (2FA): automatisch 24-woorden herstelzin maken in de enclave, kopiëren, downloaden, lokale PDF-noodkit; step-up (bestond) + audit bij aanmaken/gebruiken
- [x] Herstelkluis v2: vervallen — eigenaar koos 2-van-3 herstel, 3-van-5 kluis wordt afgeschaft
- [x] Verificatieknop verbergen zodra iemand geverifieerd is (tot het opnieuw nodig is)
- [x] Studio: oranje status "alleen op dit toestel bewaard" + lokaal bewaren + opnieuw proberen bij verbinding; echte foutmelding blijft nu zichtbaar
- [ ] Studio "failed to fetch": oorzaak nog niet gereproduceerd; volgende melding toont de echte browserfout in het detailvenster
- [x] Ontwerpdocument: cryptografisch datamodel, dreigingsmodel, mappenstructuur Rust/WASM

## Nieuwe vraag (11-11): boekingssysteem van het hoogste niveau
- [x] Fase 0: audit van bestaande boekingsmotor (bevindingen in het plan)
- [x] Developer Console: kop en voet bleven wit bij licht thema
- [x] Menu (drie streepjes): uitgelogd → uitlegpagina's, ingelogd → werkende tools
- [x] Plan boekingssysteem goedgekeurd
- [x] Fase 1 (code): veilige publieke databasefuncties (db/0216), boeken controleert werkuren, locks over middernacht, groepsacties, per-host slots, DST-correct, volledige herhaalregels (rrule), cache volgt boekingsvenster
- [x] Fase 1 (live): db/0216 + 0217 op Neon, snapshot vernieuwd, publieke boekingspagina getest
- [x] Fase 2 (code + tests): soft-lock 5 min + aftelklok, limieten dag/week/maand + per gast, werkdagenvenster, aansluitende slots (db/0218)
- [x] Fase 2 (live): db/0218 op Neon (akkoord 12-11), aftelklok getest; db/0219 groepsplaatsen in de lijst, db/0220 agenda-items per eigenaar
- [ ] Fase 3: Google / Microsoft / CalDAV tweeweg (wacht op Google- en Microsoft-sleutels)
- [ ] Fase 4: gewogen round-robin, routing-formulier, Meet/Teams/Jitsi, locaties
- [ ] Fase 5: betalen + annuleringsbeleid + gastportaal met ondertekende links + e-mails NL/EN/FR/DE
- [ ] Fase 6: E2E-intake, Boek met ROUT, afspraakpas in wallet, agenda-overlay
- [ ] Fase 7: UI (prefetch, 12/24u, tijdzone) en /discover/bookings klaar; nog weekplanner en MCP-tools
- [ ] Bevinding: betaalde afspraken lopen nu via ROUTs eigen Stripe-account (geld komt niet bij de host) — keuze eigenaar nodig
- [ ] Bevinding: gastgegevens van voorbije afspraken worden nooit opgeruimd — bewaartermijn kiezen + databaseakkoord
- [x] Eigen Ontdek-pagina voor afspraken (/discover/bookings), menu-link, deelafbeelding, sitemap; uitlegpagina afspraken herschreven (was verouderd)

## Nieuwe vraag (11-11, 18:47): wallet, deelafbeeldingen, voorbeelden
- [x] ROUT-kaart naar Google Wallet: oorzaak gevonden (kaartsleutel WALLET_ID_SECRET ontbreekt/te kort op de server); scherm toont nu de echte reden
- [ ] WALLET_ID_SECRET (min. 32 tekens) op de server zetten — wacht op eigenaar (hosting buiten Lovable)
- [x] Deelafbeeldingen profiel/anonieme vraag/steun/fooi/afspraak: in code getekend en nu als PNG bewaard in Scaleway (interne bucket)
- [x] Afbeeldingen nagekeken: geen ontbrekende bestanden; mislukte kaart levert nu altijd PNG
- [x] Voorbeeldafbeelding + kleur: hoofdpagina, about, alle info/docs-pagina's, 9 Ontdek-pagina's (eigen kaart per onderdeel), korte links/uitnodiging/statistieken
- [x] Schuifbalk en tekstselectie volgen het thema overal; Ontdek-pagina's selecteren in hun eigen kleur
- [ ] Scaleway-opslag live controleren (wacht op Scaleway-sleutels op de server)

## Nieuwe vraag (12-11): openstaand overzicht vorige AI afmaken
- [x] Hoofdpagina mobiel: 9 productsecties als tab/swipe-deck; kleur per sectie strikt eigen (geen ROUT-groen in grafieken); telefoonlengte 22.900 → 11.100 px
- [ ] Hoofdpagina mobiel verder inkorten naar 4.500–6.000 px: vraagt keuze welke blokken weg/samen mogen
- [x] Studio: lokaal opslaan gebeurt aantoonbaar vóór elke serveropslag
- [x] Studio: labels/schakelaars niet afgesneden (StudioToggleCard, LiveStatusAccordion)
- [x] Studio: laatste modus (privé/geverifieerd) ook op het account bewaren (display_prefs)
- [x] Knoppen: klassiek = 1px lichte binnenrand, harde 2px schaduw, indruk 1.5px; glas = 1px rand 8%, blur 16px, geen gloed
- [x] Badges: geen flikkering bij laden
- [x] Privacy-schild: geen wettelijke naam of handelsnaam in openbaar profiel
- [x] Live-blokken Steam/Last.fm/muziek: verdwijnen als gegevens verouderd zijn
- [x] ROUT-kaart: privégegevens bekijken max 2 minuten per bevestiging (was 5)
- [x] Docs-pagina's: "Zo werkt het", "Veelgestelde vragen", "Verder met ROUT" vertalen
- [x] Boekingen fase 2: live op Neon en getest met meerdere bezoekers

## Nieuwe vraag (12-11): deelafbeeldingen in meerdere formaten
- [x] Profiel- en uitnodigingskaarten (anoniem bericht, steun, fooi, afspraak) in 4 formaten: linkvoorbeeld 1200×630, vierkant 1080×1080, staand 1080×1350, story 1080×1920 (binnen de veilige zones)
- [x] Studio: paneel om elk formaat te bekijken en te downloaden (NL/EN/FR/DE), in "Delen" en "Social Sharing & SEO"
- [x] Ontbrekende deelafbeeldingen: alias-steun, alias-fooi, alias-feedback en workspace-feedback
- [x] /u/<naam>/agenda: volgt de hoofdgebruikersnaam (niet de alias) → krijgt de afspraak-deelafbeelding van het hoofdprofiel


## Nieuwe vraag (12-11): boekingsopdracht opnieuw gestuurd
- [x] Fase 0-audit herhaald (boekingen, achtergrondwerk, betalingen, MCP, wallet) — plan van 11-11 blijft geldig
- [x] Fase 2 gebouwd: db/0218 + 27 databasetests + regeltests, gastscherm met aftelklok, planningsregels in Boekingen-studio, NL/EN/FR/DE
- [x] db/0218 op Neon (+ 0219, 0220)
- [x] Bevinding audit: `calendar_events` alleen nog voor de eigenaar (db/0220, live)
- [x] Bevinding audit: alle 12 cron-routes nu via `cronGuard` (+ test die dit bewaakt)

## Nieuwe vraag (12-11, 10:14): "werk alles verder af"
- [x] 0218, 0219, 0220 live na akkoord; drie-bezoekerstest geslaagd
- [ ] Fase 4–7 boekingen: grote nieuwe onderdelen, elk eerst eigen plan + databaseakkoord
- [ ] Fase 3: wacht op Google- en Microsoft-sleutels

## Import into this project (Nov 12)
- [x] Verify the Route repository (github.com/Routbe/route-compass-5c35c38a) is fully imported into this project
- [x] Read all code and every page to understand Route
- [x] Then request Neon and Scaleway secrets (Neon linked as owner login; Scaleway keys saved)

## Sovereign Identity Enclave (mission directive, Nov 12)
- [x] Token boundary `src/lib/vault/token-boundary.ts` (vtk_/vcc_/mpc_/sdm_, zod, tests)
- [x] Vault migration written + tested: `db/0221_vault_enclave_isolation.sql` (0215 was taken)
- [x] Apply 0221 to the live Neon database (applied + verified: no table rights for rout_app, chain valid, no drift)
- [x] Wire passkey step-up → `register_step_up_proof` (new passkey-only, single-use action `vault_token_read`)
- [x] `crypto-enclave/pqc-envelope.ts` (ML-KEM-1024 + X25519 KitchenSink, XChaCha20-Poly1305, per-kind key holder)
- [x] `crypto-enclave/sdm-verifier.ts` (NTAG 424 DNA SUN/SDM, matches NXP AN12196 vector)
- [x] `crypto-enclave/recovery-mpc.ts` (Shamir 2-of-3, BIP39 paper factor)
- [x] `vault/vault-port.server.ts` (IVaultPort + LocalPostgresVaultAdapter, tested over real SQL)
- [ ] Account deletion/merge: handle vault tokens explicitly (FK is RESTRICT, so these fail closed today)
- [x] Server vault key: ROUT_VAULT_KEK (AES-256-GCM) wraps the server RVE1 seed; key ring db/0222 applied live
- [x] Worker basis: rve1.deviceKey / rve1.seal / rve1.open for vcc_ (device key sealed under the device key)
- [x] Owner decided: 2-of-3 only, 3-of-5 deprecated, keep shamir-secret-sharing
- [ ] Retire the 3-of-5 recovery vault screens and code
- [x] 0205/0206/0207/0213 recorded live; 0204 archived to db-archive/ and removed from the model
- [x] 0223/0225 live: free `rout_server` access removed from 5 of the 23 tables (step-up tables owner-only, user_sessions/analytics_events/profile_ingest_tokens closed)
- [ ] 0223 next phases (owner approved 12-11, continue without asking when live tests pass):
  - [ ] Sign-in & 2FA codes: security_codes, phone_otp_codes, auth_tokens -> database functions only
  - [ ] ROUT ID / OAuth: oauth_auth_codes, oauth_consents, api_keys
  - [ ] Payments: psp_credentials, verification_payments, sepa_review_queue
  - [ ] Admin: user_roles, admin_permissions, security_events, account_merge_tickets
  - [ ] Bookings, links & jobs: booking_requests, availability_jobs, alias_sync_jobs, forwarding_confirmation_sends, links
- [ ] Worker: 2-of-3 recovery ceremony — only after all 18 are replaced
- [x] 0224 live: card recovery gate without passkey — two-step tap check, 3 failures per 10 min locks card and account, card factor released only after CMAC
