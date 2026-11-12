import { z } from "zod";

export const BIO_TEMPLATE_STYLES = ["professional", "minimal", "creative"] as const;
export type BioTemplateStyle = (typeof BIO_TEMPLATE_STYLES)[number];
export type BioFormat = "clean" | "bold" | "italic" | "list";
export const bioAssistanceInput = z.object({ text: z.string().max(1000).refine(value => Boolean(value.trim()), "Bio is required") });
export const bioTemplateInput = z.object({
  role: z.string().trim().max(80),
  focus: z.string().trim().max(120),
  location: z.string().trim().max(60),
});
export type BioTemplateInput = z.infer<typeof bioTemplateInput>;

/** UTF-16 units, matching textarea maxLength and existing profile validation. */
export function bioCharacterCount(text: string, limit: number) {
  return { count: text.length, remaining: Math.max(0, limit - text.length), overLimit: text.length > limit };
}

export function cleanBioText(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/[\t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
}

/** Only user-supplied fields are combined; no facts or translations are invented. */
export function buildBioTemplate(input: BioTemplateInput, style: BioTemplateStyle): string {
  const parsed = bioTemplateInput.parse(input);
  const parts = [parsed.role, parsed.focus, parsed.location].map(cleanBioText).filter(Boolean);
  if (style === "minimal") return parts.join(" · ");
  if (style === "creative") return parts.map(part => `— ${escapeMarkdown(part)}`).join("\n");
  return parts.join(" | ");
}

/** Wrap a selected range; without a selection format the complete bio. */
export function formatBioText(text: string, format: BioFormat, start = 0, end = text.length) {
  if (format === "clean") return { text: cleanBioText(text), start: 0, end: cleanBioText(text).length };
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const selection = from === to ? text : text.slice(from, to);
  const rangeStart = from === to ? 0 : from;
  const rangeEnd = from === to ? text.length : to;
  if (!selection.trim()) return { text, start: from, end: to };
  const escaped = escapeMarkdown(selection);
  const replacement = format === "list"
    ? selection.split(/\r?\n/).filter(line => line.trim()).map(line => `- ${escapeMarkdown(line.trim())}`).join("\n")
    : `${format === "bold" ? "**" : "*"}${escaped}${format === "bold" ? "**" : "*"}`;
  return { text: text.slice(0, rangeStart) + replacement + text.slice(rangeEnd), start: rangeStart, end: rangeStart + replacement.length };
}