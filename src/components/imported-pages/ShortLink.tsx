import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db/client";
import { parseAgent } from "@/lib/user-agent";
import { useI18n } from "@/lib/i18n";

type Status = "resolving" | "not_found" | "disabled" | "expired" | "suspended" | "error";

type ResolveShortLinkRow = { id: string; status: string; target_url: string | null };

function device(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|iphone|android|phone|ipod|blackberry|opera mini/.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Public resolver for both QR redirects and short links (`/s/:slug`).
 *
 * The lookup runs through a database function so the links table stays fully
 * locked down — visitors can only ever resolve the exact code they hold.
 */
export default function ShortLink() {
  const { slug } = useParams<{ slug: string }>();
  return <ShortLinkResolver slug={slug ?? ""} />;
}

/**
 * Resolver los van de route, zodat `rout.be/A89K` (root-namespace, Base36)
 * dezelfde engine gebruikt als `/s/:slug`. Codes worden case-insensitief
 * opgezocht: de QR draagt hoofdletters, de databank kleine letters.
 */
export function ShortLinkResolver({ slug: raw }: { slug: string }) {
  const { t } = useI18n();
  const slug = raw.toLowerCase();
  const [status, setStatus] = useState<Status>("resolving");

  useEffect(() => {
    if (!slug) {
      setStatus("not_found");
      return;
    }
    let active = true;

    void (async () => {
      const { data, error } = await (
        db as unknown as {
          rpc: (
            fn: string,
            args: unknown,
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
        }
      ).rpc("resolve_short_link", { _slug: slug });
      if (!active) return;
      const row = Array.isArray(data) ? (data[0] as ResolveShortLinkRow | undefined) : null;

      if (error || !row) {
        setStatus(error ? "error" : "not_found");
        return;
      }
      if (row.status !== "ok" || !row.target_url) {
        setStatus((row.status as Status) ?? "error");
        return;
      }

      // Count the visit, but never let logging delay the redirect.
      void (db as unknown as { rpc: (fn: string, args: unknown) => Promise<unknown> }).rpc(
        "log_qr_scan",
        {
          _tracked_qr_id: row.id,
          _device: device(),
          _country: null,
          _browser: parseAgent(navigator.userAgent).browser,
          _os: parseAgent(navigator.userAgent).os,
        },
      );

      window.location.replace(row.target_url);
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  if (status === "resolving") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("shortlink.redirecting")}
        </p>
      </div>
    );
  }

  const message = {
    title: t(`shortlink.${status}.title`),
    body: t(`shortlink.${status}.body`),
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-foreground">{message.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message.body}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t("shortlink.home")}
        </Link>
      </div>
    </div>
  );
}
