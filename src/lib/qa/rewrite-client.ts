/** Browser call for the Ghost Mode magic wand (`/api/ai/rewrite`). */
export type RewriteOutcome =
  | { ok: true; text: string; via: "sovereign" | "local" }
  | { ok: false; reason: "too_many" | "invalid" | "failed" };

export async function requestRewrite(text: string, uiLanguage?: string, signal?: AbortSignal): Promise<RewriteOutcome> {
  try {
    const res = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ui_language: uiLanguage }),
      credentials: "same-origin",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000),
    });
    if (res.status === 429) return { ok: false, reason: "too_many" };
    if (res.status === 400) return { ok: false, reason: "invalid" };
    if (!res.ok) return { ok: false, reason: "failed" };
    const json = (await res.json()) as { text?: unknown; via?: unknown };
    if (typeof json.text !== "string" || !json.text.trim()) return { ok: false, reason: "failed" };
    return { ok: true, text: json.text, via: json.via === "sovereign" ? "sovereign" : "local" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
