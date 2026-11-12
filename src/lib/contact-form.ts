/**
 * Configuratie van het `contact_form`-blok (contactformulier / e-mailcapture).
 * Client-safe: zowel het Studio-paneel, de publieke kaart als de server
 * gebruiken deze parser. Opgeslagen als JSON in `ProfileBlock.value`.
 */

export interface ContactFormConfig {
  title: string;
  subtitle: string;
  /** Veldschakelaars — e-mail staat altijd aan. */
  nameField: boolean;
  messageField: boolean;
  successMessage: string;
  /** Optionele redirect-URL na een geslaagde inzending. */
  redirectUrl: string;
}

export const DEFAULT_CONTACT_FORM: ContactFormConfig = {
  title: "Neem contact op",
  subtitle: "Laat je gegevens achter, ik antwoord snel.",
  nameField: true,
  messageField: true,
  successMessage: "Bedankt! Je bericht is verstuurd.",
  redirectUrl: "",
};

export const CONTACT_MESSAGE_MAX = 1000;

export function parseContactFormConfig(raw: string | undefined | null): ContactFormConfig {
  if (!raw || !raw.trim().startsWith("{")) return { ...DEFAULT_CONTACT_FORM };
  try {
    const p = JSON.parse(raw) as Partial<ContactFormConfig>;
    return {
      title: typeof p.title === "string" && p.title ? p.title : DEFAULT_CONTACT_FORM.title,
      subtitle: typeof p.subtitle === "string" ? p.subtitle : DEFAULT_CONTACT_FORM.subtitle,
      nameField: p.nameField !== false,
      messageField: p.messageField !== false,
      successMessage:
        typeof p.successMessage === "string" && p.successMessage
          ? p.successMessage
          : DEFAULT_CONTACT_FORM.successMessage,
      redirectUrl: typeof p.redirectUrl === "string" ? p.redirectUrl : "",
    };
  } catch {
    return { ...DEFAULT_CONTACT_FORM };
  }
}

export function serializeContactFormConfig(config: ContactFormConfig): string {
  return JSON.stringify({
    title: config.title.trim(),
    subtitle: config.subtitle.trim(),
    nameField: config.nameField,
    messageField: config.messageField,
    successMessage: config.successMessage.trim(),
    redirectUrl: config.redirectUrl.trim(),
  });
}
