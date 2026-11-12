# Plan: ROUT Afspraken — boekingssysteem van het hoogste niveau

Al gedaan in deze beurt (los van dit plan): Developer Console houdt kop en voet donker bij een licht thema, en het menu (drie streepjes) stuurt uitgelogde bezoekers naar de uitlegpagina's en ingelogde leden naar de werkende tools.

## Wat de audit vond (Fase 0)

De basis is sterk: 15-minuten-beschikbaarheid per host, buffers, minimale opzegtermijn, rollend venster, round-robin en collectief, GiST tegen dubbele boekingen, Stripe-reservering van 30 min, versleutelde gevoelige intakevelden, `.ics` met `SEQUENCE`, en alleen-lezen ICS/CalDAV-sync. Maar er zijn echte fouten die eerst moeten:

1. **Publieke boekingen botsen met de strikte RLS.** Gast en cron draaien zonder ingelogde gebruiker, dus `rout_app` ziet de rijen van de host niet. Publiek boeken en de agenda-sync kunnen zo stil falen.
2. **Een boeking controleert de werkuren niet.** Wie de API direct aanroept, kan een tijd buiten de beschikbaarheid boeken.
3. **Race-gaten:** locks alleen per startdag (afspraak over middernacht), en "gedeelde" plekken vallen buiten de GiST-regel.
4. **Collectieve afspraken:** betalen, vrijgeven, bevestigen en annuleren raken maar één host-rij, niet de hele groep.
5. **Beschikbaarheid van meerdere hosts** wordt per kwartier samengevoegd, waardoor een slot kan verschijnen dat geen enkele host volledig vrij heeft.
6. **Tijdzones:** eigen rekenwerk; herhalende ICS-items schuiven bij zomer-/wintertijd; cache maar 30 dagen terwijl het venster tot 365 dagen mag.
7. Gast-link geeft alleen inzage (niet verzetten/annuleren) en verloopt nooit; Google/Outlook bestaan alleen als naam; geen echte Meet/Teams/Jitsi; wallet-pas kent de nieuwe boekingen niet; e-mails alleen Nederlands en zonder herkansing; geen boekingstools in de AI-koppeling (MCP).
8. De Omni-worker doet alleen media; boekingsonderhoud loopt via een beveiligde cron-route.

## Fasering (elke fase volledig getest en apart opgeleverd)

### Fase 1 — Fundament en beveiliging (eerst, zonder dit is de rest onbetrouwbaar)
- Nieuwe migraties `0216+` (geen databasewijziging zonder jouw akkoord per migratie).
- Publieke lees- en schrijfpaden via smalle `SECURITY DEFINER`-functies (zoals `rout_public_calendar`): slots lezen, slot reserveren, boeking bevestigen, gast-acties. `rout_app` krijgt geen ruimere rechten.
- Database-controle bij elke boeking: slot moet binnen werkuren en vrij zijn (zelfde regel in TypeScript en in SQL).
- Locks per host over alle geraakte dagen; GiST ook voor gedeelde plekken via capaciteitstelling in de functie.
- Groepsbewerkingen voor collectieve boekingen (alles of niets).
- Tijdzone-motor: `rrule` (RFC 5545) + `temporal-polyfill`; `EXDATE`, `RECURRENCE-ID`, DST-gaten en -overlap getest.
- Cachevenster volgt het ingestelde venster (max 365 dagen).

### Fase 2 — Slot-engine en regels
- **Soft-lock:** klik op een slot = 5 minuten reservering (`booking_holds`, met GiST op dezelfde tijdlijn, eigen geheime houdersleutel), zichtbare aftelklok, vrijgeven bij verlaten/verlopen. Betalen verlengt de hold tot de betaling klaar is.
- Limieten per dag/week/maand per type, rollend venster in werkdagen, nabuffers en voorbuffers per type, "alleen aansluitende slots" (gaten vermijden).
- Correcte multi-host-berekening: per host volledig vrij, daarna samenvoegen.

### Fase 3 — Agenda-koppelingen (tweeweg, live)
- **Google:** OAuth (scope `calendar.events` + `calendar.freebusy`), `events.watch` + `syncToken`, automatische vernieuwing van kanalen, schrijven naar gekozen agenda, Meet via `conferenceDataVersion=1`. Referentie: CloudMeet (zonder zware SDK, werkt op de edge).
- **Microsoft 365/Outlook:** Graph-abonnementen + `deltaLink`, vernieuwing, Teams via `isOnlineMeeting`.
- **CalDAV (iCloud, Fastmail, Nextcloud):** `sync-collection` / `ctag` / `etag`; referentie ts-caldav, eerst getest of het op de edge-runtime werkt, anders eigen dunne client.
- Meerdere agenda's per lid: per agenda "telt mee voor bezet" en één "schrijf naar"-agenda.
- Tokens verzegeld zoals `psp_credentials`; webhooks onder `/api/public/calendar/*` met kanaalgeheim-controle.
- Host verplaatst/verwijdert in Google/Outlook → ROUT past de boeking aan (met de GiST-regels) en mailt de gast een update of annulering met nieuwe `.ics`.
- Achtergrondwerk via een duurzame takenlijst in Neon (`calendar_sync_jobs`, lease + retry, zoals Omni) aangestuurd door cron + webhooks. De Omni-worker blijft voor media.

### Fase 4 — Teams, routering en locaties
- Gewogen round-robin, eerlijk op geboekte uren (30 dagen), automatische uitwijk bij een plots conflict.
- Collectief over hosts in verschillende tijdzones.
- Routing-formulier: 1–2 vragen sturen naar het juiste type of de juiste specialist.
- Locaties: Meet/Teams automatisch, Jitsi met cryptografisch willekeurige kamernaam, vaste locatie met kaartlink, "ik bel jou / jij belt mij".

### Fase 5 — Betalen, annuleren en self-service
- Betaalde afspraak pas definitief na betaling (Stripe of de eigen Stripe/Mollie-sleutels van de host); slot blijft vastgehouden.
- SEPA/Wero-QR kan geen betaling bevestigen; daar wordt de afspraak "wacht op betaling" tot de host bevestigt.
- Annuleringsbeleid ("gratis verzetten tot 24 u vooraf") afgedwongen op de server.
- Gastportaal `/booking/$bookingId`: ondertekende, verlopende links per handeling (zoals de bestaande HMAC-links): verzetten, annuleren, gasten toevoegen, `.ics` opnieuw.
- E-mails NL/EN/FR/DE met herkansing via de takenlijst.

### Fase 6 — Privacy, ROUT ID en wallet
- Echte eind-tot-eind-intake: gevoelige antwoorden worden in de browser versleuteld met een publieke sleutel van de host (enclave), alleen de host ontsleutelt.
- "Boek met ROUT": naam en privé e-mailrelay invullen, één klik boeken.
- Afspraakpas in ROUT/Google/Apple Wallet, die vervalt na de afspraak.
- Eigen agenda als overlay bij ingelogde bezoekers (alleen bezet/vrij, nooit details naar de host).

### Fase 7 — UI, AI en uitleg
- Gastpagina: buurmaanden vooraf laden, 12u/24u-schakelaar, tijdzonekeuze, aftelklok, nul laadtijd bij doorklikken.
- Host-editor: visuele weekplanner + uitzonderingen (vakanties) met live voorbeeld.
- MCP-tools: vrije slots opvragen (publiek) en een boeking voorbereiden (Zod-gevalideerd; de bezoeker bevestigt zelf, de AI boekt nooit zonder mens).
- Nieuwe Ontdek-pagina `/discover/bookings` met illustraties, in de hoofdpagina, het menu en de sitemap.
- Alles in NL/EN/FR/DE.

## Technische details
- Elke regel als pure `*-rules.ts` met unit-tests (DST, buffers, limieten, round-robin, hold-verloop) en PGlite-tests (`*-postgres.test.ts`) voor RLS, concurrency en de definer-functies; per fase: `tsgo`, vitest, `scripts/audit-rls.ts`.
- Nieuwe pakketten: `rrule`, `temporal-polyfill`; `ts-caldav` alleen na runtime-test.
- Nieuwe tabellen (voorlopig): `booking_holds`, `calendar_connections_v2` (of uitbreiding van `connected_calendars`), `calendar_watch_channels`, `calendar_sync_jobs`, `booking_routing_forms`, `booking_limits`, `booking_action_tokens`.
- Nodig van jou (geheimen, niet in code): Google Calendar-scope (Google-verificatie voor gevoelige scopes), Microsoft Entra-app (client-id/secret), eventueel een eigen Jitsi-server.

## Wat ik nodig heb om te starten
Akkoord op dit plan. Daarna begin ik met Fase 1 en vraag ik per migratie apart toestemming voor ik ze op Neon zet.
