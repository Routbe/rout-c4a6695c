import { createFileRoute, useSearch } from "@tanstack/react-router";
import {
  Globe,
  Linkedin,
  Instagram,
  Music2,
  Twitter,
  Youtube,
  Github,
  MessageCircle,
} from "lucide-react";
import { RoutLogo } from "@/components/RoutLogo";
import { useI18n } from "@/lib/i18n";

/** Short param -> presentation. Kept in sync with SOCIAL_HUB_PARAMS. */
const LINKS = [
  { param: "w", labelKey: "hub.link.website", Icon: Globe },
  { param: "li", labelKey: "hub.link.linkedin", Icon: Linkedin },
  { param: "ig", labelKey: "hub.link.instagram", Icon: Instagram },
  { param: "tt", labelKey: "hub.link.tiktok", Icon: Music2 },
  { param: "x", labelKey: "hub.link.x", Icon: Twitter },
  { param: "yt", labelKey: "hub.link.youtube", Icon: Youtube },
  { param: "gh", labelKey: "hub.link.github", Icon: Github },
  { param: "wa", labelKey: "hub.link.whatsapp", Icon: MessageCircle },
] as const;

const normalize = (param: string, value: string) => {
  if (param === "wa") return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

function HubPage() {
  const search = useSearch({ from: "/hub" });
  const { t } = useI18n();

  // `o` carries the creator's display priority as dot-separated short params.
  const priority = (search.o ?? "").split(".").filter(Boolean);
  const links = LINKS.filter((l) => search[l.param]).sort((a, b) => {
    const ia = priority.indexOf(a.param);
    const ib = priority.indexOf(b.param);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-5 py-14">
      <main className="w-full max-w-sm">
        <header className="text-center mb-8">
          <h1 className="font-display text-3xl text-foreground">
            {search.n || t("hub.defaultName")}
          </h1>
          {search.t && <p className="text-sm text-muted-foreground mt-2">{search.t}</p>}
        </header>

        {links.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">{t("hub.empty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {links.map(({ param, labelKey, Icon }) => (
              <li key={param}>
                <a
                  href={normalize(param, search[param]!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted/60"
                >
                  <Icon className="w-4 h-4 text-foreground" aria-hidden />
                  <span className="font-medium text-sm text-foreground">{t(labelKey)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-12 flex justify-center opacity-60">
          <a href="/about?ref=watermark" aria-label={t("hub.madeWith")}>
            <RoutLogo size={20} />
          </a>
        </footer>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/hub")({
  validateSearch: (search: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(search).filter(([, v]) => typeof v === "string")) as Record<
      string,
      string | undefined
    >,
  head: () => ({
    meta: [
      { title: "Link hub | ROUT" },
      {
        name: "description",
        content: "Alle sociale links van dit profiel op één kleine, snelle pagina.",
      },
      { property: "og:title", content: "Link hub | ROUT" },
      {
        property: "og:description",
        content: "Alle sociale links van dit profiel op één kleine, snelle pagina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HubPage,
});
