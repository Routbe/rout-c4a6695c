/** Blocks short-link destinations that are commonly abused (raw IPs, local hosts, known-bad hosts). */
const BLOCKED_HOSTS = [
  "localhost", "bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy", "ow.ly",
  "grabify.link", "iplogger.org", "iplogger.com", "2no.co", "blasze.com", "ps3cfw.com",
];

export function shortLinkTargetBlocked(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return true;
  if (url.username || url.password) return true;
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}
