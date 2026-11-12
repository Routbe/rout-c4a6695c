/**
 * Compound-name parsing en handle-opbouw voor GEVERIFIEERDE accounts.
 *
 * Ondersteunt Belgische/Nederlandse samengestelde achternamen ("De Smet",
 * "van der Graven") en meerdere voornamen ("Jona Zeno").
 *
 * REGEL VAN WETTELIJKE HERLEIDBAARHEID: minstens één primair naamdeel
 * (primaire voornaam OF primaire achternaam) staat altijd voluit in de handle.
 * Tussennamen en secundaire achternaamdelen zijn optioneel.
 *
 * Client-safe: geen server-imports.
 */

/** Tussenvoegsels die bij de achternaam horen. */
const SURNAME_PREFIXES = new Set([
  "de",
  "den",
  "der",
  "des",
  "het",
  "'t",
  "t",
  "ten",
  "ter",
  "te",
  "van",
  "vande",
  "vanden",
  "vander",
  "op",
  "in",
  "aan",
  "onder",
  "boven",
  "du",
  "le",
  "la",
  "les",
  "da",
  "di",
  "del",
  "della",
  "dos",
  "el",
  "al",
  "mac",
  "mc",
  "o",
  "st",
]);

export const HANDLE_SEPARATOR_OPTIONS = [
  { value: "", label: "geen" },
  { value: ".", label: "." },
  { value: "-", label: "-" },
  { value: "_", label: "_" },
  { value: ":", label: ":" },
  { value: "×", label: "×" },
  { value: ",", label: "," },
  { value: "~", label: "~" },
  { value: "•", label: "•" },
  { value: "|", label: "|" },
  { value: "/", label: "/" },
] as const;

export type HandleSeparator = (typeof HANDLE_SEPARATOR_OPTIONS)[number]["value"];

/** Scheidingstekens die de databank/URL echt aankan. */
export const STORAGE_SAFE_SEPARATORS = new Set([".", "-", "_", ""]);

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface ParsedLegalName {
  /** Primaire voornaam, voluit (gevouwen). */
  firstName: string;
  /** Tussennamen (tweede, derde voornaam …). */
  middleNames: string[];
  /** Alle achternaamdelen inclusief tussenvoegsels, in officiële volgorde. */
  surnameParts: string[];
}

/**
 * Splitst een volledige wettelijke naam in voornaam, tussennamen en een
 * samengestelde achternaam. Tussenvoegsels ("de", "van der") worden bij de
 * achternaam gehouden.
 */
export function parseLegalName(legalName: string | null | undefined): ParsedLegalName | null {
  const tokens = (legalName ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 2) return null;

  // Eerste tussenvoegsel (nooit op positie 0) markeert de start van de achternaam.
  let surnameStart = -1;
  for (let i = 1; i < tokens.length; i += 1) {
    if (SURNAME_PREFIXES.has(fold(tokens[i]!))) {
      surnameStart = i;
      break;
    }
  }
  if (surnameStart <= 0) surnameStart = tokens.length - 1;

  const firstNames = tokens.slice(0, surnameStart).map(fold).filter(Boolean);
  const surnameParts = tokens.slice(surnameStart).map(fold).filter(Boolean);
  if (firstNames.length === 0 || surnameParts.length === 0) return null;

  return {
    firstName: firstNames[0]!,
    middleNames: firstNames.slice(1),
    surnameParts,
  };
}

/** Achternaam voluit: alle delen aan elkaar ("desmet", "vandergraven"). */
export function surnameFull(parts: string[]): string {
  return parts.join("");
}

/** Achternaam als initialen van elk deel ("ds", "vdg"). */
export function surnameInitials(parts: string[]): string {
  return parts.map((part) => part[0] ?? "").join("");
}

/** Achternaam als één letter — de beginletter van het hoofddeel. */
export function surnameSingleInitial(parts: string[]): string {
  const main = parts[parts.length - 1] ?? "";
  return main[0] ?? "";
}

export type NameOrder = "first-first" | "surname-first";
export type MiddleMode = "full" | "initial" | "omit";
/** A = alles voluit · B = voornaam voluit + achternaam afgekort · C = voornaam afgekort + achternaam voluit */
export type FullnessMode = "all-full" | "surname-short" | "first-short";
export type SurnameShortStyle = "initials" | "single";

export interface HandleBuilderConfig {
  order: NameOrder;
  middle: MiddleMode;
  fullness: FullnessMode;
  surnameShortStyle: SurnameShortStyle;
  separator: HandleSeparator;
}

export const DEFAULT_BUILDER_CONFIG: HandleBuilderConfig = {
  order: "first-first",
  middle: "omit",
  fullness: "all-full",
  surnameShortStyle: "initials",
  separator: ".",
};

/**
 * Bouwt de handle op uit de geparste naam en de wizardkeuzes. Het resultaat is
 * altijd lowercase; enkel het gekozen scheidingsteken staat tussen de delen.
 */
export function buildHandle(name: ParsedLegalName, config: HandleBuilderConfig): string {
  const surnameShort =
    config.surnameShortStyle === "single"
      ? surnameSingleInitial(name.surnameParts)
      : surnameInitials(name.surnameParts);

  const firstPart = config.fullness === "first-short" ? (name.firstName[0] ?? "") : name.firstName;
  const surnamePart =
    config.fullness === "surname-short" ? surnameShort : surnameFull(name.surnameParts);

  const middlePieces: string[] = [];
  if (config.middle !== "omit" && name.middleNames.length > 0) {
    for (const middle of name.middleNames) {
      middlePieces.push(config.middle === "initial" ? (middle[0] ?? "") : middle);
    }
  }

  const segments =
    config.order === "first-first"
      ? [firstPart, ...middlePieces, surnamePart]
      : [surnamePart, ...middlePieces, firstPart];

  return segments.filter(Boolean).join(config.separator).toLowerCase();
}

/**
 * De handle blijft herleidbaar zolang minstens één primair naamdeel voluit in
 * de handle staat. De wizard garandeert dat al, maar dit is de expliciete check.
 */
export function isLegallyTraceable(name: ParsedLegalName, handle: string): boolean {
  const clean = fold(handle);
  return clean.includes(name.firstName) || clean.includes(surnameFull(name.surnameParts));
}

export const TRACEABILITY_MESSAGE =
  "Minstens je voornaam óf je achternaam moet voluit in je gebruikersnaam staan.";

/**
 * Opslagvorm: het gekozen sierteken (× • | / : ,) is niet URL-veilig en wordt
 * naar een punt vertaald zodra de handle echt opgeslagen wordt.
 */
export function toStorageHandle(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 30);
}
