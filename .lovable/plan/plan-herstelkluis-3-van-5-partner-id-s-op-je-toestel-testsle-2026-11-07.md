# Plan: herstelkluis (3 van 5), partner-ID's op je toestel, testsleutels

Gekozen aanpak: telkens de zwaardere, sterkere variant, zolang die echt veiliger is en niet alleen veilig lijkt. Geboortedatum, minderjarig-status en ouder-e-mail blijven leesbaar voor de server (wet en bescherming van minderjarigen). Echte nul-kennis-bewijzen en de service-worker-controle blijven gepauzeerd.

## 1. Testsleutels (ontwikkelomgeving)
- Nieuwe willekeurige sleutels aanmaken: kaartsleutel (`CARD_LIVENESS_SECRET`), inlogsleutel (`BETTER_AUTH_SECRET`), kaartnummersleutel (`WALLET_ID_SECRET`); `PUBLIC_ORIGIN` op het preview-adres.
- Let op: als dit project later de echte rout.be wordt, moeten de inlog- en kaartnummersleutel die van de huidige site zijn. Anders wordt iedereen uitgelogd en krijgen kaarten nieuwe nummers. Voor testen is een nieuwe waarde veilig.
- Daarna: testaccount aanmaken, inloggen en echt nakijken: dashboard, Studio, Account & Beveiliging, wallet, de 4 wisselende cijfers, de beveiligde achterkant, en knoppen op gsm-formaat.

## 2. Herstelkluis: 3 van 5 scherven
Je hoofdsleutel wordt wiskundig in 5 scherven gesplitst. Met 3 scherven krijg je hem terug; met 1 of 2 weet je letterlijk niets.

Sterkste variant (meer werk, wel echt beter):
- Het splitsen gebeurt in de bestaande afgeschermde rekenmodule in de browser, nooit in het gewone scherm en nooit op de server.
- We splitsen niet de sleutel zelf maar een eenmalige kluissleutel die de hoofdsleutel versleutelt. Zo kun je scherven vernieuwen zonder de hoofdsleutel te veranderen.
- Elke scherf heeft een versie, nummer, drempel, kluis-ID en controlecode. Een verkeerde of vervalste scherf wordt meteen herkend, niet pas na een mislukt herstel.
- Vijf soorten bewaarplaatsen:
  1. Papieren QR (afdrukbaar herstelvel, met controlewoorden)
  2. NFC-kaart (op Android via de browser beschrijven)
  3. Vertrouwd contact: versleuteld voor de sleutel van die persoon, zodat ROUT ze niet kan lezen
  4. Passkey/hardwaresleutel: scherf versleuteld met de sleutel uit je passkey; ROUT bewaart alleen het versleutelde blok
  5. Tweede toestel
- De server bewaart nooit 3 scherven of meer, zelfs niet versleuteld. Zo kan ROUT (of wie de server overneemt) nooit alleen herstellen.
- Scherf intrekken en opnieuw verdelen ("rotatie") maakt alle oude scherven waardeloos.
- Herstelscherm in Mechanical-stijl: kluisvoortgang met 5 sloten, scannen/tikken/contact vragen, duidelijke stap "nog 1 scherf nodig", en een oefenherstel zonder iets te wijzigen.
- Gedrag bij misbruik: herstelpogingen worden beperkt, en een vertrouwd contact moet elke vrijgave zelf bevestigen. Je krijgt bij elke herstelpoging een melding.

## 3. Partner-ID's berekend op je eigen toestel
- Per partner-app maakt je toestel een eigen, vast ID uit je passkey-sleutel. Twee partners kunnen jou nooit aan elkaar koppelen.
- De server bewaart alleen: dat ID, de partnergroep en een publieke controlesleutel, zonder verwijzing naar je account. Een volledige kopie van de database kan ze dus niet aan personen koppelen.
- Bij inloggen bij een partner bewijst je toestel met een handtekening dat het ID van jou is; pas dan geeft ROUT de partner dat ID. Het verband bestaat alleen tijdens die ene inlog.
- Eerlijke beperking: wie de server live tijdens een inlog kan meekijken, ziet dat moment wel. Dat valt niet weg te nemen zonder de gepauzeerde nul-kennis-bewijzen.
- Bestaande partnerkoppelingen blijven werken; nieuwe koppelingen gebruiken het nieuwe systeem, oude kun je zelf omzetten.
- Zonder passkey met deze functie: duidelijke melding, geen zwakkere terugval via de server.

## 4. Controle
- Tests: splitsen/samenvoegen met vaste testwaarden, elke combinatie van 3 uit 5 werkt, 2 scherven geven niets, vervalste scherf wordt geweigerd, rotatie maakt oude scherven ongeldig, server weigert een 3e scherf.
- Tests partner-ID's: zelfde partner = zelfde ID, andere partner = ander ID, server bewaart geen account-verwijzing, foute handtekening wordt geweigerd.
- Na het inloggen: echte doorloop van herstelkluis en partner-inlog op gsm- en computerformaat.

## Technische details
- Shamir over GF(256) in `crypto-enclave` (worker), met bekende-antwoordvectoren en constant-time tabelopzoekingen; scherven gecodeerd als versiegebonden binaire records (base32 voor QR, NDEF voor NFC); buffers worden na gebruik leeggemaakt volgens de bestaande enclave-regels.
- Kluissleutel: willekeurig 256-bit; hoofdsleutel AES-256-GCM-versleuteld; scherfcontrole met HMAC over kluis-ID + index.
- Passkey-scherf en partner-ID's via de bestaande WebAuthn PRF-flow (`ledger/prf.ts`) met eigen HKDF-labels per doel.
- Nieuwe tabellen (additief, met GRANT + RLS): `recovery_vaults` (eigenaar, drempel, versie), `recovery_shards_sealed` (max 2 per kluis, afgedwongen in de database), `recovery_attempts` (rate limit, meldingen), `pairwise_subjects` (sub, sector-hash, publieke sleutel; geen user-kolom).
- OIDC: consent-stap vraagt een ondertekende sub-claim van de client; issuer controleert handtekening en sector vóór uitgifte; userinfo geeft alleen `sub`.
- Geboortedatum/minderjarig/ouder-e-mail: ongewijzigd en server-leesbaar.

## Buiten dit plan
Nul-kennis-bewijzen (zoals "18+") en de service-worker-controle: gepauzeerd. Betalen via de achterkant: wacht op een betaalpartner.
