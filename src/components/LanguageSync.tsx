import { useLanguagePreference } from "@/hooks/useLanguagePreference";

/**
 * Headless: keeps the active locale in sync with the signed-in member's account
 * preference. Mounted once inside the auth provider.
 */
export function LanguageSync() {
  useLanguagePreference();
  return null;
}
