# Ingelogd testen van de ROUT-kaart met een testaccount

## Doel
Met één testaccount in je echte database controleren of alles rond je ROUT-kaart echt werkt zoals een lid het ziet.

## Stappen
1. Testaccount aanmaken via de gewone aanmeldpagina met een passkey (een nagebootste passkey in de testbrowser). Naam: duidelijk herkenbaar als test, bv. `rout-test-kaart`.
2. Tweestapsverificatie aanzetten op dat account (authenticator-app, nagebootst in de test).
3. Doorlopen en met schermafbeeldingen vastleggen:
   - Wallet openen: ROUT-kaart is eerst afgeschermd, na bevestiging zichtbaar met roterende QR.
   - Kaart draaien met de muis; geen "beweeg je telefoon" en geen "opslaan in contacten".
   - Bevriezen, ontdooien, blokkeren en vervangen: elk vraagt een nieuwe bevestiging, status wordt live Actief / Bevroren / Geblokkeerd.
   - Een gescande kaartcode toont eerst "// verificatie vereist".
   - Command Center-widget van de kaart.
   - Knoppen leesbaar in beide stijlen (hoofdstijl en glas), licht en donker.
4. Gevonden fouten meteen oplossen en opnieuw testen.
5. Na afloop: testaccount en alle bijbehorende gegevens weer verwijderen uit de database (pas na jouw akkoord op de exacte verwijderopdracht).

## Beperkingen
- Google Wallet zelf toevoegen kan pas met de Google Wallet-sleutels; ik test tot aan die knop.
- Sms en e-mailcodes werken pas als die diensten ingesteld zijn; ik gebruik daarom passkey en authenticator-app.

## Technisch
- Playwright met CDP WebAuthn virtual authenticator; TOTP-codes berekend uit het geheim dat de setup-stap toont.
- Geen wijzigingen aan echte accounts; alleen rijen van het testaccount worden aangemaakt en achteraf verwijderd.
