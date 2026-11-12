import i18next from "i18next";
import type { QaSpace } from "./useQaPublic";
import { parseShareCardLang, shareCardMeta, shareCardUrl } from "@/lib/og-action-card";

/** Head tags for the /ask pages (member page: no ROUT knowledge graph). */
export function qaAskHead(handle: string, space: QaSpace) {
  const tr = (key: string, fallback: string, params?: Record<string, string>) => {
    const out = i18next.isInitialized ? i18next.t(key, params ?? {}) : key;
    return out && out !== key ? out : fallback;
  };
  const title = tr("pages.qa.meta.title", `Stuur @${handle} een anoniem bericht`, { handle });
  const description = tr("pages.qa.meta.description", "Stuur een vraag zonder je accountgegevens met de ontvanger te delen. Toegang hangt af van de gekozen doelgroep.");
  const path = `${space === "alias" ? "/u/" : "/"}${handle}/ask`;
  return {
    meta: [
      { title },
      // An anonymous inbox must never show up in search results.
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: `https://rout.be${path}` },
      ...shareCardMeta(handle, "ask", parseShareCardLang(i18next.isInitialized ? (i18next.resolvedLanguage ?? null) : null), space === "alias" ? "alias" : "root"),
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      // Snapchat Creative Kit: sticker shown on the snap that carries this tappable link.
      { property: "snapchat:sticker", content: shareCardUrl(handle, "ask", parseShareCardLang(i18next.isInitialized ? (i18next.resolvedLanguage ?? null) : null), space === "alias" ? "alias" : "root") },
    ],
    links: [{ rel: "canonical", href: `https://rout.be${path}` }],
  };
}
