import i18next from "i18next";

// Feature-local resources keep the provider change isolated from shared locales.
const resources = {
  nl: { mismatch: "Jouw app stuurt {{received}}, geregistreerd is {{expected}}", add: "Dit adres toevoegen", failed: "Toevoegen lukte niet. Controleer het adres en probeer opnieuw." },
  en: { mismatch: "Your app sends {{received}}, registered is {{expected}}", add: "Add this address", failed: "Could not add this address. Check it and try again." },
  fr: { mismatch: "Votre app envoie {{received}}, l’adresse enregistrée est {{expected}}", add: "Ajouter cette adresse", failed: "Impossible d’ajouter cette adresse. Vérifiez-la et réessayez." },
  de: { mismatch: "Deine App sendet {{received}}, registriert ist {{expected}}", add: "Diese Adresse hinzufügen", failed: "Die Adresse konnte nicht hinzugefügt werden. Prüfe sie und versuche es erneut." },
};
export function registerRedirectTranslations() {
  for (const [locale, values] of Object.entries(resources)) {
    i18next.addResourceBundle(locale, "oauthRedirect", values, true, true);
  }
}
