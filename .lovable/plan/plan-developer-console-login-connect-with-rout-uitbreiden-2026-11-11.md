# Plan: Developer console + "Login/Connect with ROUT" uitbreiden

## Wat er nu al bestaat (onderzocht)
- `/console` met apps, sleutels, redirects, scopes, branding, beveiliging, publicatie, logs.
- "Login met ROUT" werkt al met een toestemmingsscherm, e-mailkeuze (hoofdmail, alias of privé-doorstuuradres), echte-mens-check (`sybil:verify`), wettelijke naam en gekoppelde accounts (`linked_accounts`, alleen provider + id).
- Er bestaat al een melding naar apps bij een e-mailwijziging (`user.email_updated`), maar alleen per app die je zelf kiest — niet automatisch voor allemaal.

## 1. Apps aanmaken en terugvinden repareren (eerst)
Waarschijnlijke oorzaken (in de code gevonden, nog niet bevestigd met de gegevens van maximilien-6yak):
- **Laatste stap mislukt:** de server vraagt om een nieuwe bevestiging (passkey) voordat een app wordt aangemaakt, maar de wizard toont dat venster niet en geeft alleen een foutmelding. Ook weigert de server meerdere redirect-domeinen, terwijl de wizard die wel toelaat.
- **Oude apps verdwenen:** de lijst toont alleen apps van jou *in de workspace die nu actief is*. Apps die je persoonlijk maakte, zie je niet in een workspace (en omgekeerd); teamleden zien elkaars apps niet.
Oplossing:
- Eerst de echte gegevens alleen lezen om de oorzaak te bevestigen.
- Wizard: bevestigingsvenster tonen en daarna opnieuw proberen; redirects op één domein controleren al in de wizard; app en instellingen in één stap opslaan.
- Lijst: wisselaar "Persoonlijk / Workspace X"; teamleden met de juiste rol zien de apps van de workspace; de lijst vernieuwt na het wisselen.

## 2. Adres voor workspaces /w/ in plaats van /u/
- Elk adres van een workspace (console, kopteksten, deellinks) wordt `/w/<naam>`; `/u/` blijft alleen voor personen.
- Gaat een workspace van privé naar openbaar (of wordt hij geverifieerd), dan wordt het adres `/w/<naam>` (of het eigen domein); oude `/u/`-links sturen door.

## 3. Accounts herkennen (keuze van de ontwikkelaar)
Instellingen per app in de console:
- **Accounts herkennen aan/uit:** de app krijgt te zien welke koppelingen (Google, GitHub, e-mail...) de gebruiker bij ROUT heeft, maar alleen na toestemming van de gebruiker.
- **Samenvoegen:** heeft de gebruiker al een account bij de app, dan gaat hij verder met dat account (gekoppeld aan ROUT).
- **Meerdere accounts kiezen (extra optie):** de gebruiker vinkt aan welke bestaande accounts hij wil samenvoegen tot één account en kiest met welk hij verdergaat.
- **Extra infolijntje:** de app mag per account één korte tip meegeven (gebruikersnaam, laatst actief, aantal chats/repos...). Standaard raden we "laatst actief" aan. ROUT toont altijd het icoon + de naam van de dienst + het gekoppelde e-mailadres; de tip van de app wordt duidelijk als "volgens <app>" getoond.
- Nieuwe gebruikersschermen: een duidelijke lijst met kaartjes ("Ga verder als..." / meerdere selecteren); op de telefoon onder elkaar met grote knoppen.

## 4. "Connect with ROUT" — e-mail overal tegelijk wijzigen
- Nieuwe knop voor apps naast "Login met ROUT": verbinden zonder in te loggen, om e-mailwijzigingen te ontvangen.
- In ROUT: pagina "E-mailadressen" met hoofdmail + extra adressen voor derden. Kies een nieuw standaardadres, dan "doorgeven aan...": alles aanvinken in één keer, afzonderlijk uitvinken, of per app een ander adres kiezen.
- Apps krijgen de wijziging via de bestaande ondertekende melding; in de console stelt de ontwikkelaar het webhook-adres in en kan hij een test sturen.

## 5. Stapsgewijs om toestemming vragen (zoals Google)
- Bij de eerste login vraagt de app alleen het minimum.
- Pas bij "Verifieer met ROUT" verschijnt een apart ROUT-scherm: toestemming voor echte mens, volledige naam en een uniek nummer per app (nooit het interne ROUT-nummer).
- In de console kiest de ontwikkelaar welke rechten bij het inloggen gevraagd worden en welke later.

## 6. ROUT-gebruikersnamen voor apps
- Nieuw recht: de app mag de ROUT-gebruikersnaam overnemen, zodat ze zelf geen beveiliging tegen bots en het claimen van namen hoeven te bouwen. Namen blijven uniek en worden met dezelfde regels beschermd; bij een naamswijziging krijgt de app een melding.

## Technische details
- Fix 1: `console.apps.new.tsx` (step-up wrapper zoals `OAuthConsole`, één-host validatie), `provider.server.ts` (insert + settings in één transactie, lijst per workspace op basis van rol), query key met user/workspace in `console-data.ts`; eerst een read-only query op `oauth_clients` voor deze gebruiker.
- Workspace-URL's via de `workspace-rules.ts`-helper overal; redirectroute `/u/<workspace>` → `/w/`.
- Nieuwe kolommen op `oauth_clients` (instellingen voor herkennen/samenvoegen/tip, gefaseerde scopes, `connect_only`); nieuwe scopes `accounts:recognize`, `accounts:merge`, `email:sync`, `username:read`; tabel voor door de app geleverde account-hints (alleen tonen, met een maximale lengte, zonder HTML); migraties worden ter goedkeuring getoond, niet automatisch toegepast.
- Email-sync: `email-broker.server.ts` + `connected-apps.functions.ts` uitbreiden met bulkselectie; webhook-event `user.username_updated` erbij.
- Tests voor: zichtbaarheid van apps per workspace, scope-fasering, de regel /w/ tegenover /u/, en de bulkselectie voor e-mail.

## Volgorde
1 → 2 → 5 → 3 → 4 → 6. Inloggen moet werken (`BETTER_AUTH_SECRET` ontbreekt nog) voordat ik de schermen als ingelogde gebruiker kan testen.
