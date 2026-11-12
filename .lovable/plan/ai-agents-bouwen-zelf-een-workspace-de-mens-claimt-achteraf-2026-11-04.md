# AI-agents bouwen zelf een workspace, de mens claimt achteraf

## Wat er al bestaat
- Een AI kan al een workspace aanmaken en krijgt een eenmalige claim-link (48 uur geldig, daarna automatisch verwijderd).
- Maar: de AI moet nu inloggen **namens een bestaand ROUT-account**. Dat is precies wat jij weg wilt.

## Wat ik bouw

### 1. Instap voor AI's, zonder account
- Nieuwe uitlegpagina **/about/ai-agents** (mens + machine leesbaar) met de volledige stappen.
- Vindbaar voor AI-modellen via `llms.txt`, een machine-manifest op `/.well-known/rout-agent.json` en een link in de pagina-kop. Voor mensen is er alleen een onopvallende link onderaan; geen misleidende verborgen knoppen.
- De AI registreert zichzelf met een **eenmalige rekenpuzzel** (proof-of-work) tegen spam, krijgt een tijdelijke **sandbox-sleutel** die alleen voor die ene ongeclaimde workspace werkt.

### 2. Wat de AI volledig zelf kan in de sandbox
- Workspace aanmaken (naam, slug, beschrijving).
- Een **ROUT-login app** aanmaken (naam, redirect-URL's, logo) — staat op "concept" tot de workspace geclaimd is, zodat niemand er al mee kan inloggen.
- Een **profiel in de Studio ontwerpen** met alle design-elementen (kleuren, lettertypes, blokken, links, avatar) via dezelfde opslag als de Studio, zodat de eigenaar na het claimen precies ziet wat de AI bouwde.
- Alles blijft onzichtbaar voor zoekmachines en bezoekers tot het geclaimd is.

### 3. Claimen — drie manieren, alle eenmalig
- **Link** (zoals nu).
- **QR-code**: de AI krijgt een QR-afbeelding terug van ROUT zelf.
- **Code**: een lange code (bv. `ROUT-XXXX-XXXX-…`, 24 tekens met controlecijfer) om in te typen.
- Nieuw **tandwiel-icoontje rechts van "Nieuwe workspace"** (Profiel → Persoonlijk) → pagina **"Claim workspace"** met camera-scanner en invoerveld.
- Na claimen: jij wordt eigenaar, de login-app gaat live, de AI-sleutel vervalt en blijft enkel zichtbaar als verbonden app die je kan intrekken.

### 4. Veiligheid
- Alle sleutels en codes enkel als hash opgeslagen; nooit in logs.
- Pogingen per IP en per code beperkt (na 5 foute codes vergrendeld).
- Sandbox-sleutel werkt alleen voor die ene workspace, max. 48 uur, max. aantal workspaces per AI/IP per dag.
- Geen e-mail, betalingen, publiek profiel of domein vóór de claim.
- Elke handeling van de AI komt in het bestaande audit-logboek.

## Belangrijk — wat jij moet doen
De database van ROUT is extern. Ik schrijf de nodige database-wijziging als bestand, maar **pas ze niet zelf toe** (zo afgesproken). Tot jij die uitvoert, werkt het systeem alleen in code en tests, niet live.

## Technische details
- Nieuwe migratie `db/0175_agent_sandbox.sql`: `agent_sandboxes` (key_hash, pow nonce, ip-bucket, expires), claim-code hash + attempts op de bestaande claim-tabel, owner-less provision-functie, `draft`-status voor OAuth-clients van ongeclaimde workspaces, SECURITY DEFINER-functies `rout_agent_sandbox_*`.
- Endpoints: `POST /api/agent/sandbox` (challenge + registratie), sandbox-auth naast `authenticateAgent`, `POST /api/agent/sandbox/apps`, `PUT /api/agent/sandbox/profile`, `GET /api/agent/sandbox/claim.png` (QR).
- UI: tandwiel in `WorkspaceSwitcher`/`ProfileMenu`, route `/studio/workspaces/claim` (QR-scan + code), hergebruik van claim-preview/claim.
- Tests voor code-formaat/checksum, pogingslimiet, TTL, scopes en strikte invoer.
