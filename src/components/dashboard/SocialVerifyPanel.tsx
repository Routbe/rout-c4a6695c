import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Loader2, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OPEN_PROTOCOL_PLATFORMS,
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  canRefresh,
  formatFollowers,
  type SocialLinkDTO,
  type SocialPlatform,
} from "@/lib/social-verify";
import {
  getSocialLinks,
  refreshSocialLink,
  removeSocialLink,
  saveSocialLink,
  verifySocialOwnership,
} from "@/lib/social-verify.functions";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Studio-paneel voor sociale accounts: toevoegen, eigendom verifiëren via een
 * bio-link (`rout.be/<handle>`) en het gecachte volgeraantal verversen
 * (maximaal één keer per 24 uur).
 */
export function SocialVerifyPanel({ handle }: { handle: string }) {
  const [links, setLinks] = useState<SocialLinkDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [username, setUsername] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalFor, setModalFor] = useState<SocialLinkDTO | null>(null);

  const profileUrl = useMemo(
    () => `rout.be/${handle ? handle.replace(/^@/, "") : "[handle]"}`,
    [handle],
  );

  useEffect(() => {
    let active = true;
    getSocialLinks()
      .then((rows) => {
        if (active) setLinks(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function replace(link: SocialLinkDTO | null) {
    if (!link) return;
    setLinks((current) => {
      const next = current.filter((item) => item.id !== link.id);
      return [...next, link].sort((a, b) => a.platform.localeCompare(b.platform));
    });
  }

  async function handleAdd() {
    if (!username.trim()) return;
    setBusyId("new");
    try {
      const result = await saveSocialLink({ data: { platform, username } });
      if (!result.ok || !result.link) {
        toast.error(trI18n.t("ui.9854f792d0"));
        return;
      }
      replace(result.link);
      setUsername("");
      toast.success(`${PLATFORM_LABEL[platform]} toegevoegd — verifieer nu je eigendom`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleVerify(link: SocialLinkDTO) {
    setBusyId(link.id);
    try {
      const result = await verifySocialOwnership({ data: { id: link.id } });
      replace(result.link);
      if (result.ok) {
        setModalFor(null);
        toast.success(`${PLATFORM_LABEL[link.platform]} geverifieerd`);
      } else if (result.reason === "fetch_failed") {
        toast.error(trI18n.t("ui.d819e5a219"));
      } else {
        toast.error(`We vonden ${profileUrl} nog niet in je bio.`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefresh(link: SocialLinkDTO) {
    setBusyId(link.id);
    try {
      const result = await refreshSocialLink({ data: { id: link.id } });
      replace(result.link);
      if (result.reason === "rate_limited") {
        toast.error(trI18n.t("ui.3f2f12476a"));
      } else if (result.ok) {
        toast.success(trI18n.t("ui.7909a7e6ac"));
      } else {
        toast.error(trI18n.t("ui.72ec84248a"));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(link: SocialLinkDTO) {
    setBusyId(link.id);
    try {
      await removeSocialLink({ data: { id: link.id } });
      setLinks((current) => current.filter((item) => item.id !== link.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-lg font-medium">Sociale accounts &amp; verificatie</h2>
      <p className="px-1 text-sm text-muted-foreground">
        Bewijs dat een account van jou is door <strong>{profileUrl}</strong> in de bio te plaatsen.
        Na verificatie tonen we een groen vinkje en het gecachte volgeraantal op je publieke profiel
        — zonder externe API-calls bij elk bezoek.
      </p>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Platform"
        >
          {SOCIAL_PLATFORMS.map((value) => (
            <option key={value} value={value}>
              {PLATFORM_LABEL[value]}
            </option>
          ))}
        </select>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={platform === "mastodon" ? "@jij@mastodon.social" : "gebruikersnaam"}
          className="h-9 w-56"
        />
        <Button size="sm" onClick={handleAdd} disabled={busyId === "new" || !username.trim()}>
          {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Toevoegen"}
        </Button>
      </div>

      {loading ? (
        <p className="px-1 text-sm text-muted-foreground">Laden…</p>
      ) : links.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Nog geen sociale accounts toegevoegd.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const followers = formatFollowers(link.followerCount);
            const refreshable = canRefresh(link.lastSyncedAt);
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{PLATFORM_LABEL[link.platform]}</span>
                <span className="text-muted-foreground">{link.username}</span>
                {link.isVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <BadgeCheck className="h-4 w-4" aria-hidden /> Geverifieerd
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Niet geverifieerd</span>
                )}
                {followers && (
                  <span className="text-xs text-muted-foreground">{followers} volgers</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {!link.isVerified && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        OPEN_PROTOCOL_PLATFORMS.includes(link.platform)
                          ? handleVerify(link)
                          : setModalFor(link)
                      }
                      disabled={busyId === link.id}
                    >
                      {busyId === link.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck className="mr-1 h-4 w-4" aria-hidden /> Verifieer eigendom
                        </>
                      )}
                    </Button>
                  )}
                  {link.isVerified && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRefresh(link)}
                      disabled={busyId === link.id || !refreshable}
                      title={refreshable ? "Ververs data" : "Eén keer per 24 uur"}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" aria-hidden /> Ververs data
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(link)}
                    disabled={busyId === link.id}
                    aria-label="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(modalFor)} onOpenChange={(open) => !open && setModalFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Verifieer je {modalFor ? PLATFORM_LABEL[modalFor.platform] : ""}
            </DialogTitle>
            <DialogDescription>
              Plaats <strong>{profileUrl}</strong> (of <strong>rout.be/u/{handle}</strong>) in de
              bio van je {modalFor ? PLATFORM_LABEL[modalFor.platform] : ""}-profiel en klik op
              “Controleren”. Je mag de link daarna laten staan — bij de dagelijkse controle blijft
              je vinkje zo actief.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalFor(null)}>
              Later
            </Button>
            <Button
              onClick={() => modalFor && handleVerify(modalFor)}
              disabled={Boolean(modalFor && busyId === modalFor.id)}
            >
              {modalFor && busyId === modalFor.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Controleren"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
