/**
 * Client-side URL syntax checking. Deliberately never performs a network or
 * server-side fetch of user input (SSRF / latency / false positives).
 */

export type UrlStatus = "empty" | "valid" | "notice" | "invalid";

export interface UrlCheck {
  status: UrlStatus;
  /** Normalized value safe to encode in the QR (empty when unusable). */
  normalized: string;
  message?: string;
}

/** Strip duplicated protocols and whitespace, then prepend https:// if missing. */
export function normalizeUrlInput(raw: string): string {
  let v = (raw ?? "").trim().replace(/\s+/g, "");
  if (!v) return "";
  // https://https://x.com, http://https://x.com, https:/x.com …
  v = v.replace(/^(https?:\/{1,2})+(?=https?:\/\/)/i, "");
  v = v.replace(/^https?:\/(?!\/)/i, (m) => `${m}/`);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  return v.replace(/([^:])\/{2,}/g, "$1/");
}

export function checkUrl(raw: string): UrlCheck {
  const input = (raw ?? "").trim();
  if (!input) return { status: "empty", normalized: "" };

  const normalized = normalizeUrlInput(input);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { status: "invalid", normalized: "", message: "This is not a valid web address." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      status: "notice",
      normalized,
      message: "Custom protocol — only apps that registered it will open this code.",
    };
  }

  const host = url.hostname;
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return {
      status: "notice",
      normalized,
      message: "Local or internal address — only reachable on that network.",
    };
  }
  if (host.includes("..") || host.startsWith(".") || host.endsWith(".")) {
    return { status: "invalid", normalized: "", message: "The domain contains a typo." };
  }
  const tld = host.split(".").pop() ?? "";
  if (!host.includes(".") || tld.length < 2 || /\d/.test(tld)) {
    return { status: "invalid", normalized: "", message: "Missing or invalid domain extension." };
  }
  if (url.protocol === "http:") {
    return {
      status: "notice",
      normalized,
      message: "Notice: unencrypted http:// — make sure this URL is live before printing.",
    };
  }

  return { status: "valid", normalized, message: "Valid web address." };
}
