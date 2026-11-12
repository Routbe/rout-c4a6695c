# Mechanical Elegance + Glass: interne ontwerpmotor op topniveau

De publieke hoofdpagina (globe + terminal) blijft volledig onaangeroerd. Alles hieronder geldt alleen voor de ingelogde omgeving (Command Center, Studio, Dashboard, Analytics, Instellingen) en de QR-studio.

## Wat er nu misloopt (vastgesteld in de code)

1. **Knoppen zijn lomp.** De huidige standaard dwingt overal 2px-hoeken, 4px zwarte schaduw en dikke randen af — ook op kaarten, kleine icoonknoppen rechtsboven, tabs en menu's. Dat is precies het "kapotte Windows 95"-gevoel uit je notities.
2. **Glas-ontwerp is onvindbaar.** De keuze staat alleen verstopt onder het tabblad "Profiel" van Accountinstellingen en in het mobiele menu, met de onduidelijke namen "Sovereign/Creator" en zonder voorbeeld. Bovendien wordt de keuzeknop zelf in het harde ontwerp getekend.
3. **Verspringen bij laden.** Je keuze (en licht/donker) wordt pas ná het opstarten van de pagina uit het geheugen van de browser gelezen. De server kent je keuze niet, dus de eerste beelden kunnen een ander ontwerp of andere kleurmodus tonen. De exacte oorzaak bij jou bevestig ik eerst met beeld-per-beeld opnames van het laden (stap 1).

## Het nieuwe standaardontwerp: "Mechanical Elegance"

Rustig, ruim en premium (niveau Linear/Vercel), met één mechanisch accent:

- **Pill-vorm** voor actieknoppen, statusindicatoren, tabs en navigatieknoppen ("Aanpassen", "Sync", "Studio", "Publiceren").
- **Kaarten en panelen**: zacht afgerond (16px), ondoorzichtig, alleen een flinterdunne rand — **géén schaduw**.
- **Icoonknoppen rechtsboven** (profiel, schild, menu): geen kader, geen schaduw; alleen een zachte achtergrond bij aanwijzen.
- **Alleen primaire knoppen** krijgen de tactiele blokschaduw: 2px, 1px rand. Bij klikken schuift de knop exact 2px naar rechtsonder en verdwijnt de schaduw — een korte, soepele "klik".
- Secundaire knoppen: dunne rand, geen schaduw. Tabs: één pill-baan waarin de actieve tab gevuld oplicht.
- Menu's, dialogen en meldingen: afgerond, ondoorzichtig, dunne rand, geen vervaging.
- **Donkere modus krijgt een eigen afgestemde versie** (zwarte schaduw is onzichtbaar op zwart; daar wordt de schaduw een gedempte lichte rand), plus nette focusrand voor toetsenbord en rustiger beweging als het apparaat "minder beweging" vraagt.

## Het tweede ontwerp: "Glass"

Het oorspronkelijke zachte ontwerp (glas, vervaging, zachte schaduwen, vloeibaar-glaseffect) blijft exact zoals het was, als volwaardige keuze.

## De keuzeschakelaar

- **Eigen sectie "Weergave" bovenaan Accountinstellingen** (eerste tabblad, direct zichtbaar), met twee grote voorbeeldkaarten die elk een live miniatuur tonen van hoe knoppen, kaarten en tabs er in dat ontwerp uitzien. Klikken wisselt meteen, zonder herladen.
- Dezelfde keuze compact in het profielmenu en het mobiele menu.
- Duidelijke namen: **Mechanical** (standaard) en **Glass**.
- Wordt onthouden per apparaat én meegestuurd naar de server, zodat de eerste geladen pagina al meteen het juiste ontwerp en de juiste licht/donker-modus heeft — geen verspringen meer.
- Opslaan op je account (zodat het op al je toestellen volgt) wordt voorbereid in de database; dit kan pas echt getest worden zodra het oorspronkelijke ROUT-aanmelden werkt.

## Volgorde van werken

1. **Verspringen reproduceren**: beeld-per-beeld opnames van het laden (licht/donker, beide ontwerpen, telefoon en computer) om de echte oorzaak vast te leggen.
2. Ontwerpmotor herbouwen op basis van ontwerpwaarden in plaats van één grote "overschrijf alles"-regel.
3. De gedeelde bouwstenen (knoppen, tabs, kaarten, menu's, invoervelden, badges, dialogen) laten luisteren naar die waarden.
4. Handgeschreven zachte schaduwen/vervaging in interne pagina's (±90 schaduwen, ±20 vervagingen, ±50 glaspanelen) één voor één laten volgen.
5. Verspringen oplossen: keuze al op de server bekend + piepklein opstartscript dat vóór het eerste beeld het juiste ontwerp zet.
6. Nieuwe "Weergave"-sectie met voorbeeldkaarten, en de compacte schakelaar in de menu's.
7. Controle (zie onder), daarna pas melden.

## Controle

- Opnames van het laden tonen in geen enkel beeld het verkeerde ontwerp of de verkeerde kleurmodus.
- Automatische meting in de browser: in Mechanical geen schaduwen op kaarten/icoonknoppen, geen vervaging, pill-vormen op actieknoppen, exact 2px indrukken; in Glass zijn de originele effecten terug.
- Hoofdpagina met globe: identiek aan het origineel (beeldvergelijking).
- Profiel-, QR- en exportontwerpen van gebruikers blijven ongewijzigd in beide ontwerpen.
- Omdat het oorspronkelijke ROUT-aanmelden nog niet werkt, bouw ik een **interne ontwerp-proefpagina** (alleen in de ontwikkelomgeving, niet gepubliceerd) die de echte interne onderdelen met voorbeeldgegevens toont, zodat beide ontwerpen op 1280/810/390px echt bekeken kunnen worden.
- Tests voor de regels: standaard = Mechanical, keuze blijft bewaard, hoofdpagina krijgt nooit een intern ontwerp.

## Technische details

- `src/lib/internal-interface-theme.ts`: themes `mechanical` | `glass` (legacy `sovereign`→`mechanical`, `creator`→`glass` gemapt zodat bestaande keuzes behouden blijven); cookie `rout-ui-material` + localStorage.
- `__root.tsx`: SSR leest cookie via server-side request (createServerFn/`getCookie`) en zet `data-theme`, `data-workspace-ui` en `class="dark"`/`color-scheme` al in de HTML; inline `<script>` in `<head>` als vangnet vóór eerste paint (ook voor kleurmodus die nu alleen in useEffect wordt gezet). Effect-cleanup die attributen tijdelijk verwijdert wordt geschrapt.
- `src/styles/internal-interface.css` herschreven als tokenlaag: `--ui-radius-control`, `--ui-radius-surface`, `--ui-radius-field`, `--ui-border-hairline`, `--ui-shadow-action`, `--ui-press-offset`, `--ui-surface-blur`, `--ui-surface-shadow`, per `[data-theme]` en per licht/donker. Glass-waarden reproduceren de bestaande cascade exact. `@scope ... to ([data-profile-theme], [data-qr-container], [data-interface-artwork], .preview-sheet)` blijft voor artwork-uitsluiting; de wildcard-`*`-reset verdwijnt.
- shadcn `button`, `tabs`, `toggle-group`, `card`, `badge`, `dialog`, `sheet`, `dropdown-menu`, `popover`, `input`, `select`, `sonner` en de `spatial-*` utilities lezen de tokens; varianten `default`/`destructive` = actie (schaduw), `outline`/`secondary`/`ghost`/`icon` = statisch.
- Interne pagina's: `shadow-*`, `backdrop-blur-*`, `acrylic-card`/`spatial-glass`/`glow-card` gemigreerd naar semantische utilities (`surface-panel`, `surface-raised`, `action-tactile`) die in Glass het oude effect geven.
- Accountvoorkeur: nieuwe nullable kolom voor interfacemateriaal in Neon via migratie + server function met bestaande sessiecontrole; pas end-to-end testbaar na herstel van ROUT-aanmeldconfiguratie.
- Dev-only route voor de materiaal-proefpagina (uitgesloten van productie).
- AGENTS.md-regel "Interface materials" en geheugenregel bijgewerkt (Mechanical standaard, Glass als keuze, hoofdpagina nooit).
