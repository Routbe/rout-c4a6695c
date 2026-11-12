import { z } from "zod";

/** Local, deterministic contact triage: keyword and length rules, no external services. */

export const contactTriageInput = z.object({ message: z.string().trim().min(10).max(10000) });
export const CONTACT_CATEGORIES = ["Support", "Bug", "Sales", "Veiligheid", "Algemeen"] as const;
export const CONTACT_PRIORITIES = ["Laag", "Normaal", "Hoog", "Urgent"] as const;
export const contactTriageResult = z.object({
  summary: z.string().min(1).max(1200),
  category: z.enum(CONTACT_CATEGORIES),
  priority: z.enum(CONTACT_PRIORITIES),
  nextStep: z.string().min(1).max(1000),
  matched: z.array(z.string()).max(20),
});
export type ContactTriage = z.infer<typeof contactTriageResult>;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];
export type ContactPriority = (typeof CONTACT_PRIORITIES)[number];

/** Remove obvious credentials and contact addresses before showing a summary. */
export function prepareContactMessage(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mailadres]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [verwijderd]")
    .replace(/\b(password|wachtwoord|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi, "$1: [verwijderd]");
}

// Stems in NL / EN / FR / DE. Matched on word starts, case- and accent-insensitive.
const KEYWORDS: Record<Exclude<ContactCategory, "Algemeen">, string[]> = {
  Veiligheid: ["gehackt", "hacked", "hack", "phishing", "datalek", "data breach", "fraude", "fraud", "oplichting", "scam", "gestolen", "stolen", "overgenomen", "impersonat", "identiteitsfraude", "piraté", "gehackt worden", "betrüg"],
  Bug: ["bug", "fout", "error", "crash", "werkt niet", "doesn't work", "does not work", "not working", "kapot", "broken", "laadt niet", "won't load", "blanco", "leeg scherm", "blank", "500", "404", "foutmelding", "glitch", "ne fonctionne pas", "funktioniert nicht", "fehler"],
  Support: ["inlog", "login", "log in", "sign in", "wachtwoord", "password", "account", "verificatie", "verify", "verified", "e-mail", "email", "code", "betaling", "betaald", "payment", "paid", "refund", "terugbetal", "factuur", "invoice", "abonnement", "subscription", "help", "hulp", "hoe ", "how do", "kan ik", "can i", "verwijder", "delete", "aide", "hilfe", "konto", "compte"],
  Sales: ["prijs", "prijzen", "price", "pricing", "offerte", "quote", "samenwerk", "partnership", "partner", "sponsor", "zakelijk", "business", "enterprise", "licentie", "license", "demo", "bulk", "reseller", "wederverkop", "kortingscode voor", "tarif", "preis", "angebot"],
};
const URGENT = ["gehackt", "hacked", "phishing", "datalek", "data breach", "fraude", "fraud", "gestolen", "stolen", "overgenomen", "piraté"];
const HIGH = ["dringend", "urgent", "asap", "onmiddellijk", "immediately", "meteen", "spoed", "dringend", "kan niet inloggen", "can't log in", "cannot log in", "geen toegang", "no access", "betaald maar", "paid but", "geld kwijt", "dubbel betaald", "charged twice", "werkt niet meer", "down", "sofort", "immédiatement"];
const THANKS = ["bedankt", "dank je", "thanks", "thank you", "merci", "danke", "compliment", "top app"];

const NEXT_STEPS: Record<ContactCategory, string> = {
  Veiligheid: "Behandel als beveiligingsmelding: controleer recente aanmeldingen, beveilig het account en vraag de melder om bewijs via het vertrouwde kanaal.",
  Bug: "Reproduceer het probleem met de genoemde stappen en het toestel, noteer de foutmelding en maak een bugticket aan.",
  Support: "Controleer het account of de betaling van de melder en antwoord met concrete stappen of een oplossing.",
  Sales: "Stuur door naar sales: bevestig de vraag, deel de prijsinformatie en plan indien nodig een kennismaking.",
  Algemeen: "Lees het bericht na, beantwoord de vraag of stuur het door naar het juiste team.",
};

function normalize(text: string): string {
  return ` ${text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, " ")} `;
}
function hits(haystack: string, words: string[]): string[] {
  const found = new Set<string>();
  for (const word of words) {
    const w = normalize(word).trim();
    if (!w) continue;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}`).test(haystack)) found.add(word.trim());
  }
  return [...found];
}

/** First one or two sentences of the cleaned message, at most 280 characters. */
export function summarizeContact(message: string): string {
  const clean = prepareContactMessage(message).replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  let summary = (sentences[0] ?? clean).trim();
  if (summary.length < 80 && sentences[1]) summary = `${summary} ${sentences[1].trim()}`;
  return summary.length > 280 ? `${summary.slice(0, 277).trimEnd()}…` : summary;
}

export function triageContact(message: string): ContactTriage {
  message = contactTriageInput.parse({ message }).message;
  const text = normalize(message);
  const scores = (Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]).map((category) => ({
    category,
    matched: hits(text, KEYWORDS[category]),
  }));
  const security = scores.find((s) => s.category === "Veiligheid");
  // Tie order: Bug > Support > Sales.
  const ranked = scores.filter((s) => s.category !== "Veiligheid").sort((a, b) => b.matched.length - a.matched.length);
  const first = ranked[0];
  const best = security?.matched.length ? security : first?.matched.length ? first : null;
  const category: ContactCategory = best ? best.category : "Algemeen";

  const urgent = hits(text, URGENT);
  const high = hits(text, HIGH);
  const exclaim = (message.match(/!/g) ?? []).length >= 3;
  const length = message.trim().length;
  let priority: ContactPriority = "Normaal";
  if (urgent.length) priority = "Urgent";
  else if (high.length || exclaim || (category === "Bug" && (best?.matched.length ?? 0) >= 3)) priority = "Hoog";
  else if ((category === "Algemeen" || category === "Sales") && (length < 80 || hits(text, THANKS).length)) priority = "Laag";

  return contactTriageResult.parse({
    summary: summarizeContact(message),
    category,
    priority,
    nextStep: NEXT_STEPS[category],
    matched: [...new Set([...(best?.matched ?? []), ...urgent, ...high])].slice(0, 20),
  });
}
