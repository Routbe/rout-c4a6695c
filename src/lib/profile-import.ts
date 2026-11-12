/**
 * Profile import: restore from a ROUT data export or move over from LinkStack.
 *
 * Pure and browser-safe. The result only feeds the Studio editor state; the
 * normal autosave then writes it to the private draft through the same
 * server-side validation as any manual edit. Nothing is published directly.
 */
import { BLOCK_KINDS, newBlockId, type ProfileBlock } from "./profile";

export type ImportSource = "rout" | "linkstack";

export interface ProfileImport {
  source: ImportSource;
  displayName: string | null;
  tagline: string | null;
  blocks: ProfileBlock[];
  /** Entries that could not be converted safely (unsupported or unsafe). */
  skipped: number;
}

export type ProfileImportError = "invalid_json" | "unknown_format" | "empty" | "too_large";

/** Exports are small JSON files; anything bigger is refused before parsing. */
export const IMPORT_MAX_BYTES = 5_000_000;
/** Same cap as the Studio links patch schema. */
export const IMPORT_MAX_BLOCKS = 100;

const KIND_RE = /^[a-z0-9_:]{1,40}$/;
const SAFE_LINK_RE = /^(https?:\/\/|mailto:|tel:)/i;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const optStr = (v: unknown, max: number): string | undefined => {
  const s = str(v, max);
  return s ? s : undefined;
};

function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Thumbnails: only https or small inline images; anything else is dropped. */
function safeThumb(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (/^https:\/\//i.test(v) && v.length <= 2000) return v;
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v) && v.length <= 400_000) return v;
  return undefined;
}

const VISIBILITY = new Set(["always_visible", "hide_when_focus_mode", "show_only_when_live"]);
const CONTEXT = new Set(["global", "professional", "social"]);
const SIZES = new Set(["small", "wide", "large"]);
const CONTENT_TYPES = new Set(["link", "article", "podcast", "media"]);

/** Keeps only known ProfileBlock fields with the right types. */
export function sanitizeImportedBlock(raw: unknown): ProfileBlock | null {
  if (!isObj(raw)) return null;
  const kind = str(raw["kind"], 40);
  if (!KIND_RE.test(kind)) return null;
  const value = typeof raw["value"] === "string" ? raw["value"].slice(0, 20_000) : "";
  if (/^\s*(javascript|data|vbscript):/i.test(value)) return null;
  const block: ProfileBlock = {
    id: str(raw["id"], 64) || newBlockId(),
    kind,
    label: str(raw["label"], 200),
    value,
  };
  if (raw["hidden"] === true) block.hidden = true;
  if (raw["pinned"] === true) block.pinned = true;
  const badge = optStr(raw["badge"], 32);
  if (badge) block.badge = badge;
  const startsAt = isoOrUndefined(raw["startsAt"]);
  if (startsAt) block.startsAt = startsAt;
  const expiresAt = isoOrUndefined(raw["expiresAt"]);
  if (expiresAt) block.expiresAt = expiresAt;
  const thumb = safeThumb(raw["thumbnailUrl"]);
  if (thumb) block.thumbnailUrl = thumb;
  if (raw["iconMode"] === "favicon" || raw["iconMode"] === "globe") block.iconMode = raw["iconMode"];
  if (typeof raw["visibilityRule"] === "string" && VISIBILITY.has(raw["visibilityRule"]))
    block.visibilityRule = raw["visibilityRule"] as ProfileBlock["visibilityRule"];
  if (typeof raw["contextTag"] === "string" && CONTEXT.has(raw["contextTag"]))
    block.contextTag = raw["contextTag"] as ProfileBlock["contextTag"];
  if (typeof raw["size"] === "string" && SIZES.has(raw["size"])) block.size = raw["size"] as ProfileBlock["size"];
  if (typeof raw["contentType"] === "string" && CONTENT_TYPES.has(raw["contentType"]))
    block.contentType = raw["contentType"] as ProfileBlock["contentType"];
  if (raw["display"] === "button" || raw["display"] === "icon" || raw["display"] === "both") block.display = raw["display"];
  if (raw["kineticTheme"] === "aurora" || raw["kineticTheme"] === "glass") block.kineticTheme = raw["kineticTheme"];
  if (Array.isArray(raw["stats"])) {
    const stats = raw["stats"].filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 40)).slice(0, 20);
    if (stats.length) block.stats = stats;
  }
  return block;
}

/** Turns a plain URL into the best matching ROUT block kind (e.g. github.com/x → github). */
export function blockFromUrl(url: string, label: string): ProfileBlock | null {
  const trimmed = url.trim();
  if (!SAFE_LINK_RE.test(trimmed)) return null;
  if (/^mailto:/i.test(trimmed)) return { id: newBlockId(), kind: "email", label: label || "E-mail", value: trimmed.replace(/^mailto:/i, "").split("?")[0] ?? "" };
  if (/^tel:/i.test(trimmed)) return { id: newBlockId(), kind: "phone", label: label || "Telefoon", value: trimmed.replace(/^tel:/i, "") };
  const lower = trimmed.toLowerCase().replace(/^http:\/\//, "https://");
  const variants = [lower, lower.replace("https://www.", "https://"), lower.replace("https://", "https://www.")];
  for (const def of BLOCK_KINDS) {
    if (!def.base || !/^https:\/\//.test(def.base)) continue;
    const base = def.base.toLowerCase();
    const hit = variants.find((v) => v.startsWith(base));
    if (!hit) continue;
    const rest = trimmed.slice(trimmed.length - (hit.length - base.length)).replace(/[/?#].*$/, "");
    if (!rest) continue;
    return { id: newBlockId(), kind: def.kind, label: label || def.label, value: rest };
  }
  let host = "";
  try {
    host = new URL(trimmed).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return { id: newBlockId(), kind: "link", label: label || host, value: trimmed };
}

function parseRout(doc: Json): ProfileImport {
  const profile = isObj(doc["profile"]) ? doc["profile"] : {};
  const rawBlocks = Array.isArray(doc["blocks"]) ? doc["blocks"] : Array.isArray(profile["blocks"]) ? profile["blocks"] : [];
  const blocks: ProfileBlock[] = [];
  let skipped = 0;
  for (const raw of rawBlocks) {
    const b = sanitizeImportedBlock(raw);
    if (b) blocks.push(b);
    else skipped += 1;
  }
  return {
    source: "rout",
    displayName: optStr(profile["display_name"], 80) ?? null,
    tagline: optStr(profile["tagline"], 160) ?? null,
    blocks,
    skipped,
  };
}

function linkstackLinks(doc: Json): { user: Json; links: unknown[] } | null {
  const user = isObj(doc["user"]) ? doc["user"] : Array.isArray(doc["user"]) && isObj(doc["user"][0]) ? (doc["user"][0] as Json) : doc;
  const links = Array.isArray(doc["links"]) ? doc["links"] : Array.isArray(user["links"]) ? user["links"] : null;
  if (!links) return null;
  const looksLikeLinkStack = links.some((l) => isObj(l) && ("link" in l || "button_id" in l || "title" in l));
  return looksLikeLinkStack || links.length === 0 ? { user, links } : null;
}

function parseLinkStack(user: Json, links: unknown[]): ProfileImport {
  const sorted = links
    .filter(isObj)
    .map((l, i) => ({ l, order: typeof l["order"] === "number" ? l["order"] : i }))
    .sort((a, b) => a.order - b.order)
    .map((x) => x.l);
  const blocks: ProfileBlock[] = [];
  let skipped = links.length - sorted.length;
  for (const l of sorted) {
    const title = str(l["title"], 200);
    const link = str(l["link"], 2000);
    const type = str(l["type"], 30).toLowerCase();
    if (type === "spacer") {
      blocks.push({ id: newBlockId(), kind: "spacer", label: "Spacer", value: "" });
      continue;
    }
    if (type === "heading" || type === "text" || (!link && title)) {
      const text = type === "text" ? str(l["link"], 2000) || title : title;
      if (text) blocks.push({ id: newBlockId(), kind: "text", label: "Tekst", value: text });
      else skipped += 1;
      continue;
    }
    if (type === "email" && link) {
      const b = blockFromUrl(link.startsWith("mailto:") ? link : `mailto:${link}`, title);
      if (b) blocks.push(b);
      else skipped += 1;
      continue;
    }
    if (type === "telephone" && link) {
      const b = blockFromUrl(link.startsWith("tel:") ? link : `tel:${link}`, title);
      if (b) blocks.push(b);
      else skipped += 1;
      continue;
    }
    const b = link ? blockFromUrl(link, title) : null;
    if (b) blocks.push(b);
    else skipped += 1;
  }
  return {
    source: "linkstack",
    displayName: optStr(user["name"], 80) ?? null,
    tagline: optStr(user["littlelink_description"], 160)?.replace(/<[^>]*>/g, "").trim() || null,
    blocks,
    skipped,
  };
}

/** Detects the file type and converts it into ROUT blocks. */
export function parseProfileImport(text: string): ProfileImport | { error: ProfileImportError } {
  if (text.length > IMPORT_MAX_BYTES) return { error: "too_large" };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { error: "invalid_json" };
  }
  if (!isObj(doc)) return { error: "unknown_format" };
  const format = typeof doc["format"] === "string" ? doc["format"] : "";
  let result: ProfileImport | null = null;
  if (format.startsWith("rout.data-export") || (isObj(doc["profile"]) && Array.isArray(doc["blocks"]))) {
    result = parseRout(doc);
  } else {
    const ls = linkstackLinks(doc);
    if (ls) result = parseLinkStack(ls.user, ls.links);
  }
  if (!result) return { error: "unknown_format" };
  if (result.blocks.length === 0 && !result.displayName && !result.tagline) return { error: "empty" };
  return result;
}

/**
 * Combines imported blocks with the current list. Append gives every imported
 * block a fresh id (no collisions with existing blocks); both modes respect the cap.
 */
export function mergeImportedBlocks(
  current: ProfileBlock[],
  imported: ProfileBlock[],
  mode: "append" | "replace",
): { blocks: ProfileBlock[]; dropped: number } {
  const taken = new Set(mode === "append" ? current.map((b) => b.id) : []);
  const fresh = imported.map((b) => {
    if (!taken.has(b.id) && mode === "replace") {
      taken.add(b.id);
      return b;
    }
    let id = newBlockId();
    while (taken.has(id)) id = newBlockId();
    taken.add(id);
    return { ...b, id };
  });
  const base = mode === "append" ? current : [];
  const room = Math.max(0, IMPORT_MAX_BLOCKS - base.length);
  return { blocks: [...base, ...fresh.slice(0, room)], dropped: Math.max(0, fresh.length - room) };
}
