import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, HeartHandshake } from "lucide-react";
import { getTipJarQr } from "@/lib/tip-page.functions";

type Theme = { card: string; border: string; text: string; muted: string };

/** Visitor page switch; only shown when the member has more than one public page. */
export function ProfilePageTabs({ handle, theme, active = "profile" }: { handle: string; theme: Theme; active?: "profile" | "tip" }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["tip-jar", handle], queryFn: () => getTipJarQr({ data: { handle } }), staleTime: 300_000 });
  if (!q.data) return null;
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? `${theme.card} ${theme.text} border ${theme.border}` : `${theme.muted} hover:opacity-80`}`;
  return (
    <nav aria-label={t("profile.pagesNav", "Pagina's")} className="flex justify-center gap-1">
      <Link to="/$username" params={{ username: handle }} aria-current={active === "profile" ? "page" : undefined} className={pill(active === "profile")}>
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />{t("profile.pageProfile", "Profiel")}
      </Link>
      <Link to="/$username/tip" params={{ username: handle }} search={{ donation: undefined, status: undefined }} aria-current={active === "tip" ? "page" : undefined} className={pill(active === "tip")}>
        <HeartHandshake className="h-3.5 w-3.5" aria-hidden />{t("profile.pageTip", "Steunpagina")}
      </Link>
    </nav>
  );
}
