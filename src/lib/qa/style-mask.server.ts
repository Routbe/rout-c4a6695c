/**
 * Ghost Mode rewrite through a sovereign OpenAI-compatible endpoint
 * (Infomaniak AI Tools by default: INFOMANIAK_AI_PRODUCT_ID + SOVEREIGN_AI_API_KEY;
 * any other provider via SOVEREIGN_AI_BASE_URL, optional SOVEREIGN_AI_MODEL /
 * SOVEREIGN_AI_FALLBACK_MODEL). Never throws, never logs the text and never
 * returns the original: on any failure the deterministic neutralizer is used.
 */
import { QUESTION_MAX } from "@/lib/questions-rules";
import {
  REWRITE_FALLBACK_MS,
  REWRITE_PRIMARY_MS,
  acceptRewrite,
  buildRewritePrompt,
  frameRewriteInput,
  cleanModelOutput,
  neutralizeStyle,
  resolveSovereignEndpoint,
} from "./style-mask";

export type MaskResult = { text: string; via: "sovereign" | "local" };

function local(text: string, uiLanguage?: string | null): MaskResult {
  return { text: neutralizeStyle(text, uiLanguage).slice(0, QUESTION_MAX), via: "local" };
}

async function attempt(url: string, key: string, model: string, infomaniak: boolean, prompt: string, text: string, ms: number) {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(ms),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 300,
      ...(infomaniak ? { reasoning_effort: "none" } : {}),
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: frameRewriteInput(text) },
      ],
    }),
  });
  if (!res.ok) {
    console.warn("[qa] style mask provider refused", { status: res.status, model });
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const out = cleanModelOutput(json.choices?.[0]?.message?.content, QUESTION_MAX);
  if (out && !acceptRewrite(text, out)) {
    console.warn("[qa] style mask output rejected", { model });
    return null;
  }
  return out;
}

/** `uiLanguage` only breaks ties for ambiguous input; the model keeps the input's own language. */
export async function maskWritingStyle(text: string, uiLanguage?: string | null): Promise<MaskResult> {
  const key = process.env["SOVEREIGN_AI_API_KEY"]?.trim();
  const endpoint = resolveSovereignEndpoint({
    baseUrl: process.env["SOVEREIGN_AI_BASE_URL"],
    productId: process.env["INFOMANIAK_AI_PRODUCT_ID"],
    model: process.env["SOVEREIGN_AI_MODEL"],
    fallbackModel: process.env["SOVEREIGN_AI_FALLBACK_MODEL"],
  });
  if (!key || !endpoint) return local(text, uiLanguage);
  const prompt = buildRewritePrompt(uiLanguage, text);
  for (const [i, model] of endpoint.models.entries()) {
    try {
      const out = await attempt(endpoint.url, key, model, endpoint.infomaniak, prompt, text, i === 0 ? REWRITE_PRIMARY_MS : REWRITE_FALLBACK_MS);
      if (out) return { text: out, via: "sovereign" };
    } catch (e) {
      console.warn("[qa] style mask attempt failed", { model, reason: e instanceof Error ? e.name : "error" });
    }
  }
  return local(text, uiLanguage);
}
