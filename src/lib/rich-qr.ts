/**
 * Rich multi-field QR types: vCard contacts, iCalendar events, a social
 * profile hub, map locations and meeting links.
 * Field metadata drives the generic form in QRInputFields.
 */
export type RichQRId =
  | "vcard"
  | "event"
  | "social"
  | "maps"
  | "meeting"
  | "applink"
  | "phone"
  | "signal"
  | "telegram"
  | "threema"
  | "matrix"
  | "snapchat"
  | "discord"
  | "linkedin"
  | "steam";

export interface RichField {
  key: string;
  label: string;
  labelNl: string;
  placeholder?: string;
  type?: "text" | "tel" | "email" | "url" | "datetime-local" | "textarea" | "image";
  optional?: boolean;
}

export interface RichQRDefinition {
  id: RichQRId;
  label: string;
  fields: RichField[];
}

export const RICH_QR_TYPES: RichQRDefinition[] = [
  {
    id: "vcard",
    label: "Contact (vCard)",
    fields: [
      { key: "firstName", label: "First name", labelNl: "Voornaam", placeholder: "Jona" },
      { key: "lastName", label: "Last name", labelNl: "Achternaam", placeholder: "Delplanche" },
      {
        key: "phoneMobile",
        label: "Mobile phone",
        labelNl: "Gsm-nummer",
        type: "tel",
        placeholder: "+32 470 00 00 00",
      },
      {
        key: "phoneWork",
        label: "Work phone",
        labelNl: "Werktelefoon",
        type: "tel",
        optional: true,
        placeholder: "+32 56 00 00 00",
      },
      {
        key: "email",
        label: "E-mail",
        labelNl: "E-mail",
        type: "email",
        placeholder: "hello@rout.be",
      },
      { key: "company", label: "Company", labelNl: "Bedrijf", optional: true, placeholder: "ROUT" },
      {
        key: "title",
        label: "Job title",
        labelNl: "Functie",
        optional: true,
        placeholder: "Founder",
      },
      {
        key: "website",
        label: "Website",
        labelNl: "Website",
        type: "url",
        optional: true,
        placeholder: "https://rout.be",
      },
      {
        key: "linkedin",
        label: "LinkedIn URL",
        labelNl: "LinkedIn-URL",
        type: "url",
        optional: true,
        placeholder: "https://linkedin.com/in/…",
      },
      {
        key: "address",
        label: "Address",
        labelNl: "Adres",
        optional: true,
        placeholder: "Grote Markt 1, 8500 Kortrijk",
      },
      {
        key: "photo",
        label: "Profile picture / logo",
        labelNl: "Profielfoto / logo",
        type: "image",
        optional: true,
      },
    ],
  },
  {
    id: "event",
    label: "Event (calendar)",
    fields: [
      {
        key: "summary",
        label: "Event title",
        labelNl: "Titel van het evenement",
        placeholder: "ROUT launch party",
      },
      {
        key: "location",
        label: "Location",
        labelNl: "Locatie",
        optional: true,
        placeholder: "Kortrijk, BE",
      },
      { key: "start", label: "Start", labelNl: "Start", type: "datetime-local" },
      { key: "end", label: "End", labelNl: "Einde", type: "datetime-local" },
      {
        key: "description",
        label: "Description",
        labelNl: "Beschrijving",
        type: "textarea",
        optional: true,
      },
    ],
  },
  {
    id: "social",
    // The QR only points at the ROUT Profile Hub; content lives in the dashboard.
    label: "Profile Hub",
    fields: [],
  },
  {
    id: "maps",
    label: "Map location",
    fields: [
      {
        key: "query",
        label: "Address or place",
        labelNl: "Adres of plaats",
        optional: true,
        placeholder: "Grote Markt 1, 8500 Kortrijk",
      },
      {
        key: "street",
        label: "Street & number",
        labelNl: "Straat en nummer",
        optional: true,
        placeholder: "Grote Markt 1",
      },
      {
        key: "postcode",
        label: "Postal code",
        labelNl: "Postcode",
        optional: true,
        placeholder: "8500",
      },
      { key: "city", label: "City", labelNl: "Stad", optional: true, placeholder: "Kortrijk" },
      { key: "country", label: "Country", labelNl: "Land", optional: true, placeholder: "Belgium" },
      {
        key: "lat",
        label: "Latitude",
        labelNl: "Breedtegraad",
        optional: true,
        placeholder: "50.8267",
      },
      {
        key: "lng",
        label: "Longitude",
        labelNl: "Lengtegraad",
        optional: true,
        placeholder: "3.2646",
      },
    ],
  },
  {
    id: "meeting",
    label: "Meeting link",
    fields: [
      {
        key: "link",
        label: "Meeting link",
        labelNl: "Vergaderlink",
        type: "url",
        placeholder: "https://meet.google.com/abc-defg-hij",
      },
      {
        key: "passcode",
        label: "Passcode",
        labelNl: "Toegangscode",
        optional: true,
        placeholder: "123456",
      },
    ],
  },
  {
    id: "applink",
    label: "Universal app link",
    fields: [
      {
        key: "ios",
        label: "iOS App Store URL",
        labelNl: "iOS App Store-URL",
        type: "url",
        optional: true,
        placeholder: "https://apps.apple.com/app/id123456789",
      },
      {
        key: "android",
        label: "Google Play URL",
        labelNl: "Google Play-URL",
        type: "url",
        optional: true,
        placeholder: "https://play.google.com/store/apps/details?id=be.rout",
      },
      {
        key: "web",
        label: "Web fallback URL",
        labelNl: "Web-fallback-URL",
        type: "url",
        optional: true,
        placeholder: "https://rout.be",
      },
    ],
  },
  {
    id: "phone",
    label: "Phone call",
    fields: [
      {
        key: "number",
        label: "Phone number",
        labelNl: "Telefoonnummer",
        type: "tel",
        placeholder: "+32 470 00 00 00",
      },
    ],
  },
  {
    id: "signal",
    label: "Signal",
    fields: [
      {
        key: "handle",
        label: "Signal username or invite link",
        labelNl: "Signal-gebruikersnaam of uitnodigingslink",
        placeholder: "rout.01 or https://signal.me/#p/…",
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    fields: [
      {
        key: "handle",
        label: "Telegram username",
        labelNl: "Telegram-gebruikersnaam",
        placeholder: "@rout",
      },
    ],
  },
  {
    id: "threema",
    label: "Threema",
    fields: [
      { key: "handle", label: "Threema ID", labelNl: "Threema-ID", placeholder: "ABCD1234" },
    ],
  },
  {
    id: "matrix",
    label: "Matrix / Element",
    fields: [
      {
        key: "handle",
        label: "Matrix ID or room",
        labelNl: "Matrix-ID of kamer",
        placeholder: "@jona:matrix.org or #rout:matrix.org",
      },
    ],
  },
  {
    id: "snapchat",
    label: "Snapchat",
    fields: [
      {
        key: "handle",
        label: "Snapchat username",
        labelNl: "Snapchat-gebruikersnaam",
        placeholder: "routqr",
      },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    fields: [
      {
        key: "handle",
        label: "Discord invite code or link",
        labelNl: "Discord-uitnodigingscode of link",
        placeholder: "https://discord.gg/abcdef",
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn profile",
    fields: [
      {
        key: "handle",
        label: "LinkedIn profile URL or handle",
        labelNl: "LinkedIn-profiel-URL of handle",
        placeholder: "https://linkedin.com/in/jona",
      },
    ],
  },
  {
    id: "steam",
    label: "Steam profile",
    fields: [
      {
        key: "profile",
        label: "Steam profile URL, custom ID or SteamID64",
        labelNl: "Steam-profiel-URL, eigen ID of SteamID64",
        placeholder: "https://steamcommunity.com/id/jona",
      },
    ],
  },
];

export const isRichType = (id: string): id is RichQRId => RICH_QR_TYPES.some((r) => r.id === id);

export const getRichDefinition = (id: string) => RICH_QR_TYPES.find((r) => r.id === id);

/** Escape a value for vCard / iCalendar text fields. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

const trimmed = (v?: string) => (v ?? "").trim();
const httpify = (v: string) => (/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);

/** Local datetime-local input -> iCalendar UTC stamp. */
function icalStamp(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function buildVCard(v: Record<string, string>): string {
  const first = trimmed(v.firstName);
  const last = trimmed(v.lastName);
  if (!first && !last) return "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc([first, last].filter(Boolean).join(" "))}`,
  ];
  if (trimmed(v.company)) lines.push(`ORG:${esc(trimmed(v.company))}`);
  if (trimmed(v.title)) lines.push(`TITLE:${esc(trimmed(v.title))}`);
  // `phone` kept for backwards compatibility with saved codes.
  const mobile = trimmed(v.phoneMobile) || trimmed(v.phone);
  if (mobile) lines.push(`TEL;TYPE=CELL:${esc(mobile)}`);
  if (trimmed(v.phoneWork)) lines.push(`TEL;TYPE=WORK,VOICE:${esc(trimmed(v.phoneWork))}`);
  if (trimmed(v.email)) lines.push(`EMAIL;TYPE=INTERNET:${esc(trimmed(v.email))}`);
  if (trimmed(v.website)) lines.push(`URL:${esc(httpify(trimmed(v.website)))}`);
  if (trimmed(v.linkedin)) {
    const li = httpify(trimmed(v.linkedin));
    lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${esc(li)}`);
    lines.push(`item1.URL:${esc(li)}`, "item1.X-ABLabel:LinkedIn");
  }
  if (trimmed(v.photo)) lines.push(`PHOTO;VALUE=URI:${esc(httpify(trimmed(v.photo)))}`);
  if (trimmed(v.address)) lines.push(`ADR;TYPE=WORK:;;${esc(trimmed(v.address))};;;;`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export function buildEvent(v: Record<string, string>): string {
  const summary = trimmed(v.summary);
  const start = icalStamp(v.start ?? "");
  if (!summary || !start) return "";
  const end = icalStamp(v.end ?? "") || start;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ROUT//QR//EN",
    "BEGIN:VEVENT",
    `SUMMARY:${esc(summary)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
  ];
  if (trimmed(v.location)) lines.push(`LOCATION:${esc(trimmed(v.location))}`);
  if (trimmed(v.description)) lines.push(`DESCRIPTION:${esc(trimmed(v.description))}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\n");
}

/** Short query keys keep the hub URL (and therefore the QR) compact. */
export const SOCIAL_HUB_PARAMS: { key: string; param: string; label: string }[] = [
  { key: "website", param: "w", label: "Website" },
  { key: "linkedin", param: "li", label: "LinkedIn" },
  { key: "instagram", param: "ig", label: "Instagram" },
  { key: "tiktok", param: "tt", label: "TikTok" },
  { key: "x", param: "x", label: "X" },
  { key: "youtube", param: "yt", label: "YouTube" },
  { key: "github", param: "gh", label: "GitHub" },
  { key: "whatsapp", param: "wa", label: "WhatsApp" },
];

const hubOrigin = () =>
  typeof window !== "undefined" ? window.location.origin : "https://rout.be";

/**
 * Explicit display order for the hub, stored as a comma-separated key list in
 * the special `_order` value written by the network manager UI.
 */
export function socialHubOrder(v: Record<string, string>): string[] {
  const stored = trimmed(v._order)
    .split(",")
    .map((s) => s.trim())
    .filter((k) => SOCIAL_HUB_PARAMS.some((s) => s.key === k));
  const rest = SOCIAL_HUB_PARAMS.map((s) => s.key).filter((k) => !stored.includes(k));
  return [...stored, ...rest];
}

/** Social profile hub — one QR that opens a hosted page listing every network. */
export function buildSocialHub(v: Record<string, string>): string {
  // New model: the QR simply points at the user's ROUT Profile Hub page.
  const hub = trimmed(v.hub_url);
  if (hub) return hub;
  const order = socialHubOrder(v);
  const links = order
    .map((key) => SOCIAL_HUB_PARAMS.find((s) => s.key === key)!)
    .filter((s) => trimmed(v[s.key]));
  if (!links.length) return "";
  const params = new URLSearchParams();
  if (trimmed(v.name)) params.set("n", trimmed(v.name));
  if (trimmed(v.tagline)) params.set("t", trimmed(v.tagline));
  for (const s of links) params.set(s.param, trimmed(v[s.key]));
  params.set("o", links.map((s) => s.param).join("."));
  return `${hubOrigin()}/hub?${params.toString()}`;
}

/** Google Maps location — address query or raw coordinates. */
export function buildMapsLocation(v: Record<string, string>): string {
  const lat = trimmed(v.lat);
  const lng = trimmed(v.lng);
  if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  const q =
    trimmed(v.query) ||
    [
      trimmed(v.street),
      [trimmed(v.postcode), trimmed(v.city)].filter(Boolean).join(" "),
      trimmed(v.country),
    ]
      .filter(Boolean)
      .join(", ");
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Zoom / Google Meet / Teams link, with the passcode appended when supported. */
export function buildMeetingLink(v: Record<string, string>): string {
  const raw = trimmed(v.link);
  if (!raw) return "";
  const url = httpify(raw);
  const pass = trimmed(v.passcode);
  if (!pass) return url;
  try {
    const u = new URL(url);
    if (/zoom\./i.test(u.hostname) && !u.searchParams.has("pwd")) u.searchParams.set("pwd", pass);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Universal app link — one QR that lands on a hosted router page which sends
 * iOS users to the App Store, Android users to Play and everyone else to web.
 */
export function buildAppLink(v: Record<string, string>): string {
  const ios = trimmed(v.ios);
  const android = trimmed(v.android);
  const web = trimmed(v.web);
  if (!ios && !android && !web) return "";
  if (!ios && !android) return httpify(web);
  const params = new URLSearchParams();
  if (ios) params.set("i", httpify(ios));
  if (android) params.set("a", httpify(android));
  if (web) params.set("w", httpify(web));
  return `${hubOrigin()}/go?${params.toString()}`;
}

/** Single-handle messaging types (Signal, Telegram, Threema, …). */
export function buildHandleLink(id: string, v: Record<string, string>): string {
  const raw = trimmed(v.handle);
  if (id === "phone") {
    const num = trimmed(v.number).replace(/[^\d+]/g, "");
    return num ? `tel:${num}` : "";
  }
  if (!raw) return "";
  if (/^[a-z]+:\/\//i.test(raw)) return raw;
  const at = raw.replace(/^@/, "");
  switch (id) {
    case "signal":
      return `https://signal.me/#p/${encodeURIComponent(at)}`;
    case "telegram":
      return `https://t.me/${encodeURIComponent(at)}`;
    case "threema":
      return `https://threema.id/${encodeURIComponent(at.toUpperCase())}`;
    case "matrix":
      return `https://matrix.to/#/${encodeURIComponent(raw)}`;
    case "snapchat":
      return `https://snapchat.com/add/${encodeURIComponent(at)}`;
    case "discord":
      return `https://discord.gg/${encodeURIComponent(at)}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${encodeURIComponent(at)}`;
    default:
      return httpify(raw);
  }
}

const HANDLE_TYPES = [
  "phone",
  "signal",
  "telegram",
  "threema",
  "matrix",
  "snapchat",
  "discord",
  "linkedin",
];

const STEAM_ID64 = /^7656119\d{10}$/;
const STEAM_VANITY = /^[A-Za-z0-9_-]{2,32}$/;

/**
 * Normalises Steam input to a canonical profile URL. Accepts
 * steamcommunity.com/id/<custom> or /profiles/<SteamID64>, a bare SteamID64 or a
 * bare custom ID. Anything else (other hosts, store links) returns "".
 */
export function buildSteamLink(v: Record<string, string>): string {
  const raw = trimmed(v.profile);
  if (!raw) return "";
  if (STEAM_ID64.test(raw)) return `https://steamcommunity.com/profiles/${raw}`;
  if (!raw.includes("/") && !raw.includes(".")) return STEAM_VANITY.test(raw) ? `https://steamcommunity.com/id/${raw}` : "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^(www\.)?steamcommunity\.com$/i.test(u.hostname)) return "";
    const [kind, id] = u.pathname.split("/").filter(Boolean);
    if (kind === "id" && id && STEAM_VANITY.test(id)) return `https://steamcommunity.com/id/${id}`;
    if (kind === "profiles" && id && STEAM_ID64.test(id)) return `https://steamcommunity.com/profiles/${id}`;
  } catch {
    /* invalid URL */
  }
  return "";
}

export function buildRichPayload(id: string, values: Record<string, string>): string {
  if (id === "steam") return buildSteamLink(values);
  if (id === "vcard") return buildVCard(values);
  if (id === "event") return buildEvent(values);
  if (id === "social") return buildSocialHub(values);
  if (id === "maps") return buildMapsLocation(values);
  if (id === "meeting") return buildMeetingLink(values);
  if (id === "applink") return buildAppLink(values);
  if (HANDLE_TYPES.includes(id)) return buildHandleLink(id, values);
  return "";
}

/** Validation errors keyed by field. */
export function validateRich(id: string, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (id === "vcard") {
    if (!trimmed(values.firstName) && !trimmed(values.lastName))
      errors.firstName = "Enter at least a first or last name.";
    if (trimmed(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed(values.email)))
      errors.email = "Invalid e-mail address.";
    for (const key of ["phoneMobile", "phoneWork"] as const) {
      if (trimmed(values[key]) && trimmed(values[key]).replace(/[^\d]/g, "").length < 6)
        errors[key] = "Phone number looks too short.";
    }
    if (trimmed(values.linkedin) && !/linkedin\.com/i.test(trimmed(values.linkedin)))
      errors.linkedin = "Use a full linkedin.com profile URL.";
  }
  if (id === "event") {
    if (!trimmed(values.summary)) errors.summary = "Give the event a title.";
    if (!trimmed(values.start)) errors.start = "Pick a start date and time.";
    if (values.start && values.end && new Date(values.end) < new Date(values.start))
      errors.end = "End must be after the start.";
  }
  // 'social': no hard error when empty — the builder shows an inviting empty
  // state and opens the “Add block” drawer instead.
  if (id === "maps") {
    const hasCoords = trimmed(values.lat) && trimmed(values.lng);
    const hasParts =
      trimmed(values.street) ||
      trimmed(values.postcode) ||
      trimmed(values.city) ||
      trimmed(values.country);
    if (!trimmed(values.query) && !hasParts && !hasCoords)
      errors.query = "Enter an address, or both latitude and longitude.";
  }
  if (id === "meeting") {
    if (!trimmed(values.link)) errors.link = "Paste your Zoom, Meet or Teams link.";
  }
  if (id === "steam") {
    if (!buildSteamLink(values))
      errors.profile = "Use steamcommunity.com/id/… or steamcommunity.com/profiles/… (or a SteamID64).";
  }
  if (id === "applink") {
    if (!trimmed(values.ios) && !trimmed(values.android) && !trimmed(values.web))
      errors.ios = "Add at least one store link or a web fallback.";
  }
  if (id === "phone") {
    if (trimmed(values.number).replace(/[^\d]/g, "").length < 6)
      errors.number = "Enter a full phone number.";
  }
  if (HANDLE_TYPES.includes(id) && id !== "phone") {
    if (!trimmed(values.handle)) errors.handle = "Enter a username, ID or link.";
  }
  return errors;
}

/* ────────────────────────────────────────────────────────────────────────────
 * vCard 4.0 (.vcf) engine
 *
 * The QR payload uses vCard 3.0 for maximum scanner compatibility, but the
 * downloadable file uses 4.0 so modern phones import every field cleanly.
 * ──────────────────────────────────────────────────────────────────────────*/

/** Fold a vCard line to 75 octets per RFC 6350. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

/** Raw vCard 4.0 text for a contact-card value bag. */
export function buildVCard4(v: Record<string, string>): string {
  const first = trimmed(v.firstName);
  const last = trimmed(v.lastName);
  if (!first && !last) return "";

  const lines = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc([first, last].filter(Boolean).join(" "))}`,
  ];

  if (trimmed(v.company)) lines.push(`ORG:${esc(trimmed(v.company))}`);
  if (trimmed(v.title)) lines.push(`TITLE:${esc(trimmed(v.title))}`);

  const mobile = trimmed(v.phoneMobile) || trimmed(v.phone);
  if (mobile) lines.push(`TEL;TYPE="cell,voice";VALUE=uri:tel:${mobile.replace(/\s+/g, "")}`);
  if (trimmed(v.phoneWork))
    lines.push(`TEL;TYPE="work,voice";VALUE=uri:tel:${trimmed(v.phoneWork).replace(/\s+/g, "")}`);
  if (trimmed(v.email)) lines.push(`EMAIL;TYPE=work:${esc(trimmed(v.email))}`);
  if (trimmed(v.website)) lines.push(`URL:${esc(httpify(trimmed(v.website)))}`);
  if (trimmed(v.linkedin))
    lines.push(`SOCIALPROFILE;TYPE=linkedin:${esc(httpify(trimmed(v.linkedin)))}`);
  if (trimmed(v.photo)) {
    const photo = trimmed(v.photo);
    lines.push(`PHOTO:${photo.startsWith("data:") ? photo : esc(httpify(photo))}`);
  }
  if (trimmed(v.address)) lines.push(`ADR;TYPE=work:;;${esc(trimmed(v.address))};;;;`);

  lines.push(`REV:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`);
  lines.push("END:VCARD");

  return lines.map(fold).join("\r\n");
}

/** Safe filename for the downloaded card, e.g. "jona-delplanche.vcf". */
export function vCardFilename(v: Record<string, string>): string {
  const base = [trimmed(v.firstName), trimmed(v.lastName)]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "contact"}.vcf`;
}

/**
 * Trigger a browser download of the contact as a real `.vcf` blob, which is
 * what makes "Add to contacts" a one-tap action on iOS and Android.
 */
export function downloadVCard(v: Record<string, string>): boolean {
  const text = buildVCard4(v);
  if (!text || typeof document === "undefined") return false;
  const blob = new Blob([text], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = vCardFilename(v);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
