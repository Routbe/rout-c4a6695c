/** Browser-safe, exhaustive four-language card vocabulary. */
export type WalletLocale = 'nl' | 'en' | 'fr' | 'de';
export const WALLET_LOCALES: WalletLocale[] = ['nl', 'en', 'fr', 'de'];
type CardTranslations = {
  title: string; scan: string; hold: string; detected: string; cancel: string;
  hardwareId: string; activation: string; pair: string; verifying: string; success: string;
  unavailable: string; invalid: string; failed: string; invalidTag: string; readError: string; denied: string; timeout: string;
  revokeConfirm: string; activateError: string; updateError: string; loading: string; empty: string; noKey: string;
  pending: string; active: string; frozen: string; revoked: string; activate: string; freeze: string; revoke: string;
  name: string; cardNumber: string; profile: string; event: string; informational: string; when: string; venue: string; open: string;
  authentication: string; authenticationBody: string; sovereignty: string; sovereigntyBody: string;
  infrastructure: string; infrastructureBody: string; emergency: string; emergencyBody: string;
  lens: string; node: string; audit: string; kill: string; avatar: string;
};
export const walletDictionary: Record<WalletLocale, CardTranslations> = {
  nl: {
    title: 'Fysieke kaarten', scan: 'Nieuwe ROUT Card koppelen', hold: 'Houd je soevereine kaart tegen de achterkant van je apparaat.', detected: 'Hardware-ID gelezen. Vul je afzonderlijke activatiecode in.', cancel: 'Annuleren',
    hardwareId: 'Hardware-ID', activation: 'Activatiecode uit je kaartverpakking', pair: 'Koppel en activeer', verifying: 'Koppeling controleren…', success: 'Fabriekskaart gekoppeld en geactiveerd.',
    unavailable: 'Fysieke kaarten zijn nog niet ingesteld.', invalid: 'Hardware-ID of activatiecode komt niet overeen met een beschikbare fabriekskaart.', failed: 'Kaart koppelen lukt nu niet.', invalidTag: 'Geen geldige ROUT hardware-ID op deze kaart.', readError: 'Kon de chip niet lezen. Houd de kaart stil en probeer opnieuw.', denied: 'NFC-toegang geweigerd of niet beschikbaar.', timeout: 'Geen kaart gedetecteerd. Je kunt opnieuw scannen.',
    revokeConfirm: 'Definitief intrekken? Deze kaart kan daarna nooit meer gebruikt worden.', activateError: 'Alleen een chip met beveiligde sleutel kan actief worden.', updateError: 'Wijzigen lukt nu niet.', loading: 'Laden', empty: 'Nog geen fysieke kaart gekoppeld.', noKey: 'geen sleutel',
    pending: 'Wacht op activatie', active: 'Actief', frozen: 'Bevroren', revoked: 'Ingetrokken', activate: 'Activeer', freeze: 'Bevries', revoke: 'Intrekken',
    name: 'Naam', cardNumber: 'Kaartnummer', profile: 'Profiel', event: 'Evenement', informational: 'Informatief', when: 'Wanneer', venue: 'Locatie', open: 'Open profiel',
    authentication: 'Cryptografische verankering', authenticationBody: 'Deze pas verwijst naar een openbaar ROUT-profiel. Hij bewijst geen hardwarebinding of identiteit.',
    sovereignty: 'Datasoevereiniteit & jurisdictie', sovereigntyBody: 'De pas bevat uitsluitend openbare profielgegevens. Biometrische gegevens zijn niet opgenomen.',
    infrastructure: 'Infrastructuur Protocol (PASS)', infrastructureBody: 'Openbare ROUT-profielkaart. NFC-toegang en betalingen vereisen afzonderlijke activering en verificatie.',
    emergency: 'Noodintrekking', emergencyBody: 'Blokkeer een verloren fysieke kaart vanuit de kaartinstellingen in ROUT.',
    lens: '[ ⌖ ] Initialiseer PASS Lens', node: '[ ⬢ ] Open Soevereine Node', audit: '[ ⌗ ] Openbaar profiel controleren', kill: '[ ⊗ ] Kaartinstellingen: blokkeren', avatar: 'Profielfoto',
  },
  en: {
    title: 'Physical cards', scan: 'Pair a new ROUT Card', hold: 'Hold your sovereign card against the back of your device.', detected: 'Hardware ID read. Enter your separate activation code.', cancel: 'Cancel',
    hardwareId: 'Hardware ID', activation: 'Activation code from your card packaging', pair: 'Pair and activate', verifying: 'Verifying pairing…', success: 'Factory card paired and activated.',
    unavailable: 'Physical cards have not been configured yet.', invalid: 'Hardware ID or activation code does not match an available factory card.', failed: 'The card could not be paired.', invalidTag: 'No valid ROUT hardware ID on this card.', readError: 'Could not read the chip. Hold the card still and try again.', denied: 'NFC access denied or unavailable.', timeout: 'No card detected. You can scan again.',
    revokeConfirm: 'Revoke permanently? This card can never be used again.', activateError: 'Only a chip with a secure key can be activated.', updateError: 'The change could not be saved.', loading: 'Loading', empty: 'No physical card paired yet.', noKey: 'no key',
    pending: 'Awaiting activation', active: 'Active', frozen: 'Frozen', revoked: 'Revoked', activate: 'Activate', freeze: 'Freeze', revoke: 'Revoke',
    name: 'Name', cardNumber: 'Card number', profile: 'Profile', event: 'Event', informational: 'Informational', when: 'When', venue: 'Venue', open: 'Open profile',
    authentication: 'Authentication Status', authenticationBody: 'This pass links to a public ROUT profile. It does not prove hardware binding or identity.',
    sovereignty: 'Data Sovereignty & Jurisdiction', sovereigntyBody: 'The pass contains only public profile data. No biometric data are included.',
    infrastructure: 'Infrastructure Protocol (PASS)', infrastructureBody: 'Public ROUT profile card. NFC access and payments require separate activation and verification.',
    emergency: 'Emergency Revocation Protocol', emergencyBody: 'Freeze a lost physical card from the card settings in ROUT.',
    lens: '[ ⌖ ] Initialize PASS Lens', node: '[ ⬢ ] Access Sovereign Node', audit: '[ ⌗ ] Review public profile', kill: '[ ⊗ ] Card settings: freeze', avatar: 'Profile photo',
  },
  fr: {
    title: 'Cartes physiques', scan: 'Associer une ROUT Card', hold: 'Placez votre carte souveraine contre le dos de votre appareil.', detected: 'ID matériel lu. Saisissez votre code d’activation séparé.', cancel: 'Annuler',
    hardwareId: 'ID matériel', activation: 'Code d’activation fourni avec votre carte', pair: 'Associer et activer', verifying: 'Vérification de l’association…', success: 'Carte d’usine associée et activée.',
    unavailable: 'Les cartes physiques ne sont pas encore configurées.', invalid: 'L’ID matériel ou le code d’activation ne correspond pas à une carte d’usine disponible.', failed: 'Impossible d’associer la carte.', invalidTag: 'Aucun ID matériel ROUT valide sur cette carte.', readError: 'Lecture impossible. Maintenez la carte immobile et réessayez.', denied: 'Accès NFC refusé ou indisponible.', timeout: 'Aucune carte détectée. Vous pouvez réessayer.',
    revokeConfirm: 'Révoquer définitivement ? Cette carte ne pourra plus être utilisée.', activateError: 'Seule une puce dotée d’une clé sécurisée peut être activée.', updateError: 'Impossible d’enregistrer la modification.', loading: 'Chargement', empty: 'Aucune carte physique associée.', noKey: 'sans clé',
    pending: 'En attente d’activation', active: 'Active', frozen: 'Bloquée', revoked: 'Révoquée', activate: 'Activer', freeze: 'Bloquer', revoke: 'Révoquer',
    name: 'Nom', cardNumber: 'Numéro de carte', profile: 'Profil', event: 'Événement', informational: 'Informatif', when: 'Date', venue: 'Lieu', open: 'Ouvrir le profil',
    authentication: 'Statut d’authentification', authenticationBody: 'Ce pass renvoie à un profil ROUT public. Il ne prouve ni liaison matérielle ni identité.',
    sovereignty: 'Souveraineté des données et juridiction', sovereigntyBody: 'Le pass contient uniquement les données du profil public, sans données biométriques.',
    infrastructure: 'Protocole d’infrastructure (PASS)', infrastructureBody: 'Carte de profil ROUT public. L’accès NFC et les paiements nécessitent une activation et une vérification distinctes.',
    emergency: 'Protocole de révocation d’urgence', emergencyBody: 'Bloquez une carte physique perdue depuis les paramètres de carte dans ROUT.',
    lens: '[ ⌖ ] Initialiser PASS Lens', node: '[ ⬢ ] Ouvrir le nœud souverain', audit: '[ ⌗ ] Consulter le profil public', kill: '[ ⊗ ] Paramètres : bloquer la carte', avatar: 'Photo de profil',
  },
  de: {
    title: 'Physische Karten', scan: 'Neue ROUT Card koppeln', hold: 'Halten Sie Ihre souveräne Karte an die Rückseite Ihres Geräts.', detected: 'Hardware-ID gelesen. Geben Sie Ihren separaten Aktivierungscode ein.', cancel: 'Abbrechen',
    hardwareId: 'Hardware-ID', activation: 'Aktivierungscode aus der Kartenverpackung', pair: 'Koppeln und aktivieren', verifying: 'Kopplung wird geprüft…', success: 'Werkskarte gekoppelt und aktiviert.',
    unavailable: 'Physische Karten sind noch nicht eingerichtet.', invalid: 'Hardware-ID oder Aktivierungscode stimmt nicht mit einer verfügbaren Werkskarte überein.', failed: 'Die Karte konnte nicht gekoppelt werden.', invalidTag: 'Keine gültige ROUT Hardware-ID auf dieser Karte.', readError: 'Chip konnte nicht gelesen werden. Halten Sie die Karte still und versuchen Sie es erneut.', denied: 'NFC-Zugriff verweigert oder nicht verfügbar.', timeout: 'Keine Karte erkannt. Sie können erneut scannen.',
    revokeConfirm: 'Dauerhaft widerrufen? Diese Karte kann nie wieder verwendet werden.', activateError: 'Nur ein Chip mit sicherem Schlüssel kann aktiviert werden.', updateError: 'Änderung konnte nicht gespeichert werden.', loading: 'Laden', empty: 'Noch keine physische Karte gekoppelt.', noKey: 'kein Schlüssel',
    pending: 'Wartet auf Aktivierung', active: 'Aktiv', frozen: 'Gesperrt', revoked: 'Widerrufen', activate: 'Aktivieren', freeze: 'Sperren', revoke: 'Widerrufen',
    name: 'Name', cardNumber: 'Kartennummer', profile: 'Profil', event: 'Veranstaltung', informational: 'Informativ', when: 'Wann', venue: 'Ort', open: 'Profil öffnen',
    authentication: 'Authentifizierungsstatus', authenticationBody: 'Dieser Pass verlinkt ein öffentliches ROUT-Profil. Er beweist keine Hardwarebindung oder Identität.',
    sovereignty: 'Datensouveränität und Rechtsraum', sovereigntyBody: 'Der Pass enthält nur öffentliche Profildaten und keine biometrischen Daten.',
    infrastructure: 'Infrastrukturprotokoll (PASS)', infrastructureBody: 'Öffentliche ROUT-Profilkarte. NFC-Zugang und Zahlungen erfordern eine separate Aktivierung und Prüfung.',
    emergency: 'Notfall-Widerrufsprotokoll', emergencyBody: 'Sperren Sie eine verlorene physische Karte in den ROUT-Karteneinstellungen.',
    lens: '[ ⌖ ] PASS Lens starten', node: '[ ⬢ ] Souveränen Knoten öffnen', audit: '[ ⌗ ] Öffentliches Profil prüfen', kill: '[ ⊗ ] Karteneinstellungen: sperren', avatar: 'Profilfoto',
  },
};
export function createLocalizedString(translations: Record<WalletLocale, string>, defaultLocale: WalletLocale = 'en') {
  return {
    defaultValue: { language: defaultLocale, value: translations[defaultLocale] },
    translatedValues: WALLET_LOCALES.filter((locale) => locale !== defaultLocale).map((language) => ({ language, value: translations[language] })),
  };
}
export function walletText(key: keyof CardTranslations) {
  return createLocalizedString({ nl: walletDictionary.nl[key], en: walletDictionary.en[key], fr: walletDictionary.fr[key], de: walletDictionary.de[key] });
}
