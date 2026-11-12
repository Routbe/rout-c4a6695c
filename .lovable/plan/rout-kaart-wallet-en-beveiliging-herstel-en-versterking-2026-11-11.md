# ROUT-kaart, wallet en beveiliging: herstel en versterking

## Wat er nu misloopt
- In de Wallet zie je je eigen ROUT-kaart-QR niet.
- De knop om je ROUT-kaart aan Google Wallet toe te voegen voegt steeds de profielkaart toe.
- Kaarten draaien niet op desktop, en op een computer staat toch "beweeg je telefoon".
- "Opslaan in contacten" staat bij de ROUT-kaart, waar het niet thuishoort.
- Op de startpagina toont "Eén identiteit, drie niveaus" drie gelijkaardige kaarten. Het moeten 2 profielkaarten zijn plus 1 echte privé-kaart.
- De ROUT-kaart-widget in het Command Center doet weinig.

## Wat we bouwen

1. **Wallet en Google Wallet**
   - De ROUT-kaart toont weer je eigen draaiende QR-code.
   - "Toevoegen aan Google Wallet" voegt de echte ROUT-kaart toe, met een QR-code die elke 60 seconden verandert. De profielkaart blijft een aparte knop.
   - Een nieuw, verzorgd ontwerp van de kaart in Google Wallet: logo, kleur, je @naam, kaartnummer en een korte beveiligingstekst.

2. **Strenge toegang tot de kaart**
   - Een ROUT-kaart claimen kan alleen als tweestapsverificatie aan staat. Wie het nog niet heeft, krijgt een korte stap om het in te schakelen.
   - Privégegevens van de kaart (volledig nummer, codes, sleutel) blijven verborgen. Je ziet ze pas na een nieuwe controle met wat je actief hebt: passkey, sms-code, herstelcode of wachtwoord.
   - Die controle geldt maar enkele minuten en enkel op dat toestel.

3. **Kaartbeheer zoals bij een bank**
   - Blokkeren (meteen, en met één klik weer opheffen).
   - Definitief bevriezen als de kaart verloren of gestolen is.
   - Vervangen: er komt een nieuwe kaart, en het oude nummer, de oude QR-code en de NFC-sleutel werken nergens meer.
   - Voor elke actie is een nieuwe controle nodig. Je krijgt er een e-mail van en ze komt in je activiteitenlog.

4. **Kaarten in 3D**
   - Op desktop draai je de kaart met muis of trackpad.
   - Op een telefoon draait ze mee met je toestel.
   - De tekst past zich aan je toestel aan, dus "beweeg je telefoon" verschijnt niet meer op een computer.
   - "Opslaan in contacten" verdwijnt bij de ROUT-kaart.

5. **Startpagina "Eén identiteit, drie niveaus"**
   - Twee profielkaarten (publiek en alias) die naar je profielpagina linken.
   - Eén derde kaart die duidelijk anders oogt: de privé ROUT-kaart, met NFC, blokkeren en vervangen, enkel voor jezelf.

6. **Command Center-widget**
   - Toont de status van je kaart (actief, geblokkeerd of bevroren) en wanneer en waar ze laatst gebruikt werd.
   - Snelle knoppen: blokkeren, QR tonen, toevoegen aan Wallet.
   - Waarschuwt als tweestapsverificatie nog niet aan staat.

7. **Beveiligingscontrole van het hele portaal**
   - Een doorlichting van inloggen, sessies, de admin-omgeving, de publieke adressen van de app, betalingen en de kaartroutes.
   - Je krijgt een lijst met wat zwak is, gerangschikt volgens risico. De dringende punten los ik meteen op.
   - Eerlijk gezegd: "de veiligste ter wereld" kan niemand beloven. Wel bouwen we volgens de strengste gangbare standaarden: aparte controle bij gevoelige acties, niets geheims leesbaar in de browser, alles gelogd en bij twijfel weigeren.

## Wat buiten dit plan valt
- De visie uit je documenten (PASS, verkopersmodus, post-quantumbeveiliging, wallet zonder herstelzin) is te groot voor deze ronde. Die plannen we apart in kleinere stappen.
- Echte NFC-betalingen hebben goedkeuring van Google en Apple nodig. Tot die er is, blijft de NFC-sleutel uitgeschakeld.

## Technische details
- `wallet-key.ts`, `WalletVault.tsx` en `api_.wallet.google`: de kaartknop moet de SMART_TAP_KEY/TOTP-variant aanroepen (zoals `/api/access/verify`), niet PUBLIC_PROFILE. Controleren dat `WALLET_ID_SECRET` en de Google Wallet-sleutels aanwezig zijn; zonder die sleutels kan de kaart niet echt naar Google Wallet.
- Een nieuwe server-side controle `requireStepUp(max 5 min)` met de bestaande step-up-cookie en `StepUpDialog`. Verplicht bij elk serververzoek dat kaartgeheimen teruggeeft en bij blokkeren, bevriezen en vervangen.
- Claimen van een kaart: server-side controle dat 2FA (TOTP, sms of passkey) aan staat.
- Vervangen: een nieuwe `rout_card_generations`-rij, de oude serial ingetrokken via `card_freezes`. Het ontwerp volgt db/0212; een databasewijziging toon ik eerst aan jou voor ik ze uitvoer.
- `RoutCard3D`: pointer-drag op desktop, deviceorientation alleen op touch-toestellen; de tekst hangt af van `pointer: coarse`.
- Startpagina-kaarten in `home.*.json` en de bijhorende component.
- `ShareCardWidgets` en `IdentityHub` voor de nieuwe widget.
- Elke nieuwe regel krijgt een test: 2FA verplicht bij claimen, step-up verplicht bij geheimen, een vervangen kaart is ongeldig, en de wallet-knop levert het juiste type kaart.
