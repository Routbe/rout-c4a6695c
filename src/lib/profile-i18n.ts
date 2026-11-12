/**
 * Vaste teksten op publieke profielen. De taal volgt de bezoeker (cookie,
 * opgeslagen keuze of `navigator.language`), met Engels als standaard.
 */
const DICT = {
  en: { saveContact: "Save contact", verified: "verified", verifiedMember: "Official verified member", memberSince: "Member since" },
  nl: { saveContact: "Contact opslaan", verified: "geverifieerd", verifiedMember: "Officieel geverifieerd lid", memberSince: "Lid sinds" },
  fr: { saveContact: "Enregistrer le contact", verified: "vérifié", verifiedMember: "Membre officiellement vérifié", memberSince: "Membre depuis" },
  de: { saveContact: "Kontakt speichern", verified: "verifiziert", verifiedMember: "Offiziell verifiziertes Mitglied", memberSince: "Mitglied seit" },
} as const;

export type ProfileTextKey = keyof (typeof DICT)["en"];

export function profileText(locale: string | null | undefined, key: ProfileTextKey): string {
  const lang = (locale ?? "en").slice(0, 2) as keyof typeof DICT;
  return (DICT[lang] ?? DICT.en)[key];
}
