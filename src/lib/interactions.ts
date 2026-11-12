/**
 * Configuraties van de interactieve micro-app blokken:
 * poll, faq (accordion), map (locatie), custom_button en product.
 * Opgeslagen als JSON in `ProfileBlock.value`. Alle parsers zijn tolerant:
 * kapotte of kale string-input levert een veilige default op.
 */

export interface PollConfig {
  question: string;
  options: string[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqConfig {
  title: string;
  items: FaqItem[];
}

export interface MapConfig {
  address: string;
  label: string;
}

export interface CustomButtonConfig {
  url: string;
  text: string;
  image: string;
  newTab: boolean;
}

export interface ProductConfig {
  title: string;
  description: string;
  price: string;
  url: string;
  image: string;
}

export const POLL_MAX_OPTIONS = 6;

export const DEFAULT_POLL: PollConfig = { question: "", options: ["", ""] };
export const DEFAULT_FAQ: FaqConfig = { title: "Veelgestelde vragen", items: [{ q: "", a: "" }] };
export const DEFAULT_MAP: MapConfig = { address: "", label: "" };
export const DEFAULT_CUSTOM_BUTTON: CustomButtonConfig = {
  url: "",
  text: "",
  image: "",
  newTab: true,
};
export const DEFAULT_PRODUCT: ProductConfig = {
  title: "",
  description: "",
  price: "",
  url: "",
  image: "",
};

function parseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw || !raw.trim().startsWith("{")) return { ...fallback };
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return { ...fallback };
  }
}

const cleanStrings = (arr: unknown, max: number): string[] =>
  Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string").slice(0, max) : [];

export function parsePollConfig(raw: string | undefined | null): PollConfig {
  const c = parseJson<PollConfig>(raw, DEFAULT_POLL);
  const options = cleanStrings(c.options, POLL_MAX_OPTIONS);
  return {
    question: typeof c.question === "string" ? c.question : "",
    options: options.length >= 2 ? options : ["", ""],
  };
}

export function parseFaqConfig(raw: string | undefined | null): FaqConfig {
  const c = parseJson<FaqConfig>(raw, DEFAULT_FAQ);
  const items = (Array.isArray(c.items) ? c.items : [])
    .filter((i): i is FaqItem => !!i && typeof i.q === "string" && typeof i.a === "string")
    .slice(0, 12);
  return {
    title: typeof c.title === "string" && c.title ? c.title : DEFAULT_FAQ.title,
    items: items.length ? items : [{ q: "", a: "" }],
  };
}

export function parseMapConfig(raw: string | undefined | null): MapConfig {
  const c = parseJson<MapConfig>(raw, DEFAULT_MAP);
  return {
    address: typeof c.address === "string" ? c.address : "",
    label: typeof c.label === "string" ? c.label : "",
  };
}

export function parseCustomButtonConfig(raw: string | undefined | null): CustomButtonConfig {
  const c = parseJson<CustomButtonConfig>(raw, DEFAULT_CUSTOM_BUTTON);
  return {
    url: typeof c.url === "string" ? c.url : "",
    text: typeof c.text === "string" ? c.text : "",
    image: typeof c.image === "string" ? c.image : "",
    newTab: c.newTab !== false,
  };
}

export function parseProductConfig(raw: string | undefined | null): ProductConfig {
  const c = parseJson<ProductConfig>(raw, DEFAULT_PRODUCT);
  return {
    title: typeof c.title === "string" ? c.title : "",
    description: typeof c.description === "string" ? c.description : "",
    price: typeof c.price === "string" ? c.price : "",
    url: typeof c.url === "string" ? c.url : "",
    image: typeof c.image === "string" ? c.image : "",
  };
}

/** Kaart-embed zonder API-sleutel: Google Maps `output=embed` op adres-query. */
export function mapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&output=embed`;
}

export function mapExternalUrl(address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address.trim())}`;
}

export type InteractionKind = "poll" | "faq" | "map" | "custom_button" | "product";

export const isInteractionBlock = (kind: string): kind is InteractionKind =>
  kind === "poll" ||
  kind === "faq" ||
  kind === "map" ||
  kind === "custom_button" ||
  kind === "product";
