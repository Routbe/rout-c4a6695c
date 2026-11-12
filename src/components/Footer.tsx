import { LocaleDropdown } from "./LocaleDropdown";
import { Github, Instagram, Linkedin } from "lucide-react";
import { Link, useLocation } from "@/lib/router-compat";
import { RoutLogo } from "./RoutLogo";
import { StatusWidget } from "./StatusWidget";
import { BlueskyIcon, EyouIcon, MastodonIcon } from "./SocialIcons";
import { useI18n } from "@/lib/i18n";
import { SOCIAL_LINKS, GITHUB_ACCOUNT } from "@/lib/social-links";

export const GITHUB_REPO = GITHUB_ACCOUNT;

const linkClass = "text-sm text-muted-foreground hover:text-foreground transition-colors text-left";

const headingClass =
  "text-[11px] font-mono tracking-wider uppercase text-muted-foreground font-semibold";

const SOCIALS = [
  { href: SOCIAL_LINKS.github, label: "GitHub", Icon: Github },
  { href: SOCIAL_LINKS.bluesky, label: "Bluesky", Icon: BlueskyIcon },
  { href: SOCIAL_LINKS.eyou, label: "Eyou", Icon: EyouIcon },
  { href: SOCIAL_LINKS.mastodon, label: "Mastodon", Icon: MastodonIcon },
  { href: SOCIAL_LINKS.linkedin, label: "LinkedIn", Icon: Linkedin },
  { href: SOCIAL_LINKS.instagram, label: "Instagram", Icon: Instagram },
];

const PLATFORM = [
  { to: "/qr-code-generator", label: "footer.link.qr" },
  { to: "/studio", label: "footer.link.studio" },
  { to: "/batch", label: "footer.link.batch" },
  { to: "/dashboard", label: "footer.link.routing" },
];

const INFRASTRUCTURE = [
  { to: "/domains", label: "footer.link.domains" },
  { to: "/console", label: "footer.link.console" },
  { to: "/developers", label: "footer.link.docs" },
  { to: "/self-hosting", label: "footer.link.selfHosting" },
];

const ECOSYSTEM = [
  { to: "/explore", label: "footer.link.explore" },
  { to: "/manifesto", label: "footer.link.manifesto" },
  { to: "/press", label: "footer.link.press" },
  { href: GITHUB_REPO, label: "footer.link.github" },
];

const SUPPORT = [
  { to: "/contact", label: "footer.link.contact" },
  { to: "/sovereignty", label: "footer.link.sovereignty" },
  { to: "/privacy", label: "footer.link.privacy" },
  { to: "/terms", label: "footer.link.terms" },
];

const AUTH_ROUTES = new Set(["/auth", "/login"]);

/** Static footer: brand + social matrix on top, three-column grid below. */
export function Footer() {
  const { t } = useI18n();
  const location = useLocation();
  const pathname = location?.pathname ?? "";
  const isAuthRoute = AUTH_ROUTES.has(pathname) || pathname.startsWith("/auth/");
  // The admin portal is a dense working surface: the marketing footer is
  // replaced by a single compact line, and hidden entirely on small screens.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAuthRoute || isAdminRoute) {
    return (
      <footer
        className={`mt-auto border-t border-border bg-background ${
          isAdminRoute ? "hidden md:block" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 text-center text-xs text-muted-foreground">
          <span>© ROUT</span>
          <span aria-hidden>•</span>
          <Link to="/privacy" className="hover:text-foreground">
            {t("auth.footer.privacy")}
          </Link>
          <span aria-hidden>•</span>
          <Link to="/terms" className="hover:text-foreground">
            {t("auth.footer.terms")}
          </Link>
          <span aria-hidden>•</span>
          <Link to="/data-deletion" className="hover:text-foreground">
            {t("auth.footer.deletion")}
          </Link>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="container mx-auto px-4 py-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:py-8">
        <div className="min-w-0 space-y-3">
          {/* Altijd naar de root van de huidige omgeving — nooit een preview-host. */}
          <div className="flex items-center justify-between gap-3">
            <Link to="/" aria-label={t("footer.home")} className="inline-flex shrink-0">
              <RoutLogo size={24} />
            </Link>
            <LocaleDropdown />
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
          <div
            data-testid="footer-socials"
            className="flex flex-wrap items-center gap-3 pt-1 sm:gap-4"
          >
            {SOCIALS.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="size-5 shrink-0" aria-hidden />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 items-start gap-x-6 gap-y-6 sm:gap-8 md:grid-cols-4">
          <nav className="min-w-0 space-y-3">
            <p className={headingClass}>{t("footer.col.platform")}</p>
            <ul className="space-y-1.5">
              {PLATFORM.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={linkClass}>
                    {t(l.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="min-w-0 space-y-3">
            <p className={headingClass}>{t("footer.col.infrastructure")}</p>
            <ul className="space-y-1.5">
              {INFRASTRUCTURE.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={linkClass}>
                    {t(l.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="min-w-0 space-y-3">
            <p className={headingClass}>{t("footer.col.ecosystem")}</p>
            <ul className="space-y-1.5">
              {ECOSYSTEM.map((l) =>
                "href" in l ? (
                  <li key={t(l.label)}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {t(l.label)}
                    </a>
                  </li>
                ) : (
                  <li key={l.to}>
                    <Link to={l.to} className={linkClass}>
                      {t(l.label)}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>

          <nav data-testid="footer-support-nav" className="min-w-0 space-y-3">
            <p className={headingClass}>{t("footer.col.support")}</p>
            <ul className="space-y-1.5">
              {SUPPORT.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className={linkClass}>
                    {t(l.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 border-t border-border/40 pt-4 text-center text-xs text-muted-foreground">
          <p>
            <span>© 2026 ROUT</span>{" "}
            · {t("footer.credit")}{" "}
            <a
              href="https://delplanche.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              delplanche.cloud
            </a>
          </p>
          <StatusWidget className="font-mono text-xs" />
          <Link to="/about/ai-agents" className="text-[10px] text-muted-foreground/60 hover:text-foreground" data-agent-entry="/.well-known/rout-agent.json">
            Voor AI-agents
          </Link>

        </div>
      </div>
    </footer>
  );
}
