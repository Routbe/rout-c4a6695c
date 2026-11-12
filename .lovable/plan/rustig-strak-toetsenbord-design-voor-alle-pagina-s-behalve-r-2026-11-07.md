# Rustig, strak "toetsenbord"-design voor alle pagina's behalve rout.be

## Doel
- De hoofdpagina (rout.be) blijft precies zoals ze is.
- Alle andere pagina's (dashboard, Studio, instellingen, QR, beheer) krijgen standaard het rustige "Mechanical"-design: vlakke, kalme vlakken, dunne randen, en knoppen die aanvoelen als toetsen op een toetsenbord.
- "Glass / metallic" blijft bestaan als keuze per account, onder Accountinstellingen > Weergave. Daar is ruimte voor latere designs.

## 1. Toetsenbord-knoppen
- Hoofdknoppen (Opslaan, Publiceren, Studio, Hoofdpagina, Delen, statuspillen zoals "Verborgen") krijgen een scherpe zwarte rand en een harde schaduw van 2px. Ze "staan" los van de pagina.
- Bij indrukken zakt de knop 2px in, de schaduw verdwijnt (75ms, als een echte toets) en op een telefoon voel je een heel korte trilling.
- Dit gebeurt met een veerbeweging (zoals in de OMEGA-notitie), alleen in de app en nooit op rout.be.
- Respecteert "minder beweging" en de toegankelijkheidsinstellingen van het toestel.
- In donkere modus wordt de schaduw een lichte rand, zodat hij zichtbaar blijft.

## 2. Studio repareren
- De Deel-knop en de andere Studio-knoppen gebruiken nu losse eigen stijlen en vallen buiten het design. Die zet ik om naar dezelfde toetsenbord-knoppen.
- Mappen in Profielstudio: geen "map in een map" meer. Eén duidelijke kaart per map met een strakke kop, open/dicht-pijl en rustige inhoud.
- Dubbele randen en kaders die in elkaar zitten worden opgeruimd.

## 3. Geen flits bij laden
- Het gekozen design en licht/donker worden al ingesteld vóór het eerste beeld. Zo verspringt er niets bij het herladen (zowel bij een opgeslagen keuze als bij de server).
- Een keuze die je net maakt wordt niet overschreven door een oudere waarde van je account die later binnenkomt.

## 4. Controle
- Screenshots op computer en telefoon, licht en donker, van Studio, dashboard, instellingen en QR, in Mechanical én Glass.
- Ik controleer dat rout.be onveranderd is.
- Ik meet dat een knop echt inzakt en de schaduw verliest.
- De oude design-tests repareren (de test die na het wissen van opslag niet terugzet naar het standaarddesign).

## Wat niet in deze stap zit
- Inlogknoppen werkend maken (Google, GitHub ...), Google Wallet, opslag en Spotify/YouTube. Die hebben sleutels nodig die nog ontbreken; daar vraag ik later apart om.

## Technische details
- Uitbreiden van `src/styles/internal-interface.css` (scope `[data-workspace-ui="internal"][data-theme="mechanical"]`, begrensd tot alles behalve profiel- en QR-artwork). Raw `<button>`s in `src/components/studio/*` (ShareInspector, accordions) krijgen de gedeelde `Button`/`spatial-button` attributen in plaats van losse classes.
- Accordion-mappen: één surface-niveau; geneste `rounded-xl border` binnen `AccordionContent` worden in mechanical platgemaakt.
- De pers-animatie: `framer-motion` alleen lazy in interne routes, `whileTap` spring (stiffness 400, damping 17) met CSS `:active` als fallback; `navigator.vibrate(10)` op pointerdown via een helper, alleen na hydration en niet bij reduced motion.
- FOUC: het bestaande inline-headscript plus de cookie-mirror in `__root.tsx` en `internal-interface-theme.ts` uitbreiden; voor `UiPreferenceAccountSync` een versieteller zodat late server-antwoorden geen nieuwere lokale keuze overschrijven.
- Tests: `useTheme.test.tsx` en `internal-interface-theme.test.ts` bijwerken. Playwright vergelijkt het eerste beeld met het eindbeeld.
