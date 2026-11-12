/**
 * vCard-export ("Contact opslaan") voor publieke ROUT-profielen.
 *
 * Volledig client-side opgebouwd uit de gegevens die de bezoeker toch al ziet:
 * geen extra request, geen tracking, geen serveropslag.
 */

export type VCardPhoneType = "work" | "cell" | "home";
export type VCardPhone = { type: VCardPhoneType; number: string };

/** Instellingen van het "vCard / Visitekaartje"-component (JSON in block.value). */
export interface VCardConfig {
  label: string;
  title: string;
  org: string;
  phones: VCardPhone[];
  address: string;
  note: string;
  /** Notitie = bio van het profiel op het moment van downloaden. */
  noteUseBio: boolean;
  /** Leeg = het ROUT-profiel. */
  urlOverride: string;
  includeAvatar: boolean;
  includeEmail: boolean;
  includeLinks: boolean;
}

export const DEFAULT_VCARD_CONFIG: VCardConfig = {
  label: "",
  title: "",
  org: "",
  phones: [],
  address: "",
  note: "",
  noteUseBio: false,
  urlOverride: "",
  includeAvatar: true,
  includeEmail: true,
  includeLinks: true,
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseVCardConfig(raw: string | null | undefined): VCardConfig {
  let r: Record<string, unknown> = {};
  try {
    r = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    r = {};
  }
  if (!r || typeof r !== "object") r = {};
  const phones = Array.isArray(r["phones"]) ? (r["phones"] as unknown[]) : [];
  const bool = (k: keyof VCardConfig) => (r[k] === undefined ? (DEFAULT_VCARD_CONFIG[k] as boolean) : Boolean(r[k]));
  return {
    label: str(r["label"], 40),
    title: str(r["title"], 80),
    org: str(r["org"], 80),
    phones: phones
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        type: (["work", "cell", "home"].includes(String(p["type"])) ? p["type"] : "cell") as VCardPhoneType,
        number: str(p["number"], 40),
      }))
      .slice(0, 5),
    address: str(r["address"], 200),
    note: str(r["note"], 300),
    noteUseBio: bool("noteUseBio"),
    urlOverride: /^https?:\/\//i.test(String(r["urlOverride"] ?? "")) ? str(r["urlOverride"], 300) : "",
    includeAvatar: bool("includeAvatar"),
    includeEmail: bool("includeEmail"),
    includeLinks: bool("includeLinks"),
  };
}

export interface VCardInput {
  handle: string;
  displayName?: string | null;
  tagline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  /** Ingebedde JPEG (base64, zonder data:-prefix): verschijnt zo in elk adresboek. */
  photoBase64?: string | null;
  email?: string | null;
  phone?: string | null;
  org?: string | null;
  profileUrl: string;
  /** Functietitel (TITLE). */
  title?: string | null;
  /** Gecategoriseerde nummers; wint van `phone`. */
  phones?: VCardPhone[];
  /** Vrij adres als één regel (ADR, straat-veld). */
  address?: string | null;
  /** Expliciete notitie; wint van tagline/bio. */
  note?: string | null;
  /** Extra URL's (socials, website) die in de contactkaart terechtkomen. */
  links?: { label: string; url: string }[];
}

/** RFC 6350 escaping: komma's, puntkomma's, backslashes en regeleindes. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Splitst "Jan Delplanche" in een N-veld (achternaam;voornaam;;;). */
function nameField(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return `${esc(full)};;;;`;
  const last = parts.pop() as string;
  return `${esc(last)};${esc(parts.join(" "))};;;`;
}

export function buildVCard(input: VCardInput): string {
  const name = (input.displayName || `@${input.handle}`).trim();
  const note = (input.note ?? input.tagline ?? input.bio ?? "").trim();
  const phones: VCardPhone[] = input.phones?.length
    ? input.phones.filter((p) => p.number.trim())
    : input.phone?.trim()
      ? [{ type: "cell", number: input.phone.trim() }]
      : [];
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${nameField(name)}`,
    `FN:${esc(name)}`,
    `NICKNAME:${esc(input.handle)}`,
    `URL:${esc(input.profileUrl)}`,
    ...(input.email ? [`EMAIL;TYPE=INTERNET:${esc(input.email)}`] : []),
    ...phones.map((p) => `TEL;TYPE=${p.type.toUpperCase()}:${esc(p.number.trim())}`),
    ...(input.org?.trim() ? [`ORG:${esc(input.org.trim())}`] : []),
    ...(input.title?.trim() ? [`TITLE:${esc(input.title.trim())}`] : []),
    ...(input.address?.trim() ? [`ADR;TYPE=WORK:;;${esc(input.address.trim())};;;;`] : []),
    ...(input.photoBase64
      ? [`PHOTO;ENCODING=b;TYPE=JPEG:${input.photoBase64}`]
      : input.avatarUrl?.startsWith("http")
        ? [`PHOTO;VALUE=URI:${esc(input.avatarUrl)}`]
        : []),
    ...(note ? [`NOTE:${esc(note.slice(0, 300))}`] : []),
    ...(input.links ?? [])
      .filter((l) => /^https?:\/\//.test(l.url))
      .slice(0, 12)
      .map((l) => `URL;TYPE=${esc(l.label.toUpperCase().slice(0, 20))}:${esc(l.url)}`),
    "SOURCE:ROUT",
    `REV:${new Date().toISOString()}`,
    "END:VCARD",
  ];
  return lines.join("\r\n");
}

/** Bestandsnaam voor de download: `jdelplanche.vcf`. */
export function vcardFilename(handle: string): string {
  const clean = handle.replace(/[^a-z0-9._-]/gi, "").toLowerCase() || "contact";
  return `${clean}.vcf`;
}

/**
 * Haalt de profielfoto op, verkleint naar max. 256 px en geeft base64-JPEG
 * terug. Lukt dat niet (bv. CORS), dan `null` → de kaart gebruikt de URL.
 */
export async function avatarToBase64(url: string, size = 256): Promise<string | null> {
  if (typeof document === "undefined" || !/^(https?:|data:image\/)/.test(url)) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl.split(",")[1] ?? null;
  } catch {
    return null;
  }
}

/** Start de download in de browser (no-op op de server). Foto wordt ingebed. */
export async function downloadVCard(input: VCardInput): Promise<void> {
  if (typeof document === "undefined") return;
  if (!input.photoBase64 && input.avatarUrl) {
    input = { ...input, photoBase64: await avatarToBase64(input.avatarUrl) };
  }
  const blob = new Blob([buildVCard(input)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = vcardFilename(input.handle);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
