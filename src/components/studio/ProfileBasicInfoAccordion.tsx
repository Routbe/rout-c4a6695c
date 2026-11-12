import { BioAssistant } from "./BioAssistant";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MapPin, Smile } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { styledProfilePath, type UrlStyle } from "@/lib/profile-url";
import { type ProfileDisplayPrefs } from "@/lib/profile-display";
import { type ProfileBlock } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { VerifiedModal } from "./VerifiedModal";
import { BadgeCheck, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { enclave } from "@/lib/crypto-enclave/client";
import { getVerificationState } from "@/lib/verification.functions";
import { verificationCta } from "@/lib/studio-access";

/** Tekens die de studio hard afdwingt (de server knipt ook nog eens af). */
export const MAX_DISPLAY_NAME = 50;
export const MAX_BIO = 160;

/** Snelkiezer met emoji's die vaak in een bio of locatiebadge terugkomen. */
const EMOJI_QUICK_PICK = [
  "✨",
  "🚀",
  "🎯",
  "💡",
  "🎨",
  "🎧",
  "📍",
  "🌍",
  "☕",
  "🔥",
  "🧠",
  "❤️",
  "🛠️",
  "📸",
  "🌱",
];

interface Props {
  variant?: "verified" | "alias" | "workspace";
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  tagline: string;
  onTaglineChange: (value: string) => void;
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
  normalized: string;
  urlStyle: UrlStyle;
  onEditHandle: () => void;
  prefs: ProfileDisplayPrefs;
  setPref: <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
  blocks: ProfileBlock[];
  onBlocksChange: (next: ProfileBlock[]) => void;
  /** Autosave-status: toont "✓ Opgeslagen" in de accordeonkop. */
  saving?: boolean;
  savedAt?: number | null;
}

/** Gravatar accepteert sinds 2024 een SHA-256 van het e-mailadres. */
async function gravatarUrl(email: string): Promise<string> {
  const hex = await enclave.hash.sha256Hex(email.trim().toLowerCase());
  return `https://gravatar.com/avatar/${hex}?s=512&d=404`;
}

/**
 * 👤 Profiel Basisinformatie.
 *
 * Alles wat een bezoeker als eerste ziet: naam, bio, locatiebadge, avatar
 * (inclusief vorm) en de primaire sociale kanalen. Elke wijziging gaat direct
 * naar de live preview; de bovenliggende studio bewaart met debounce.
 */
export function ProfileBasicInfoAccordion({
  variant = "verified",
  displayName,
  onDisplayNameChange,
  tagline,
  onTaglineChange,
  avatarUrl,
  onAvatarUrlChange,
  normalized,
  urlStyle,
  onEditHandle,
  prefs,
  setPref,
  blocks,
  onBlocksChange,
  saving = false,
  savedAt = null,
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const fetchState = useServerFn(getVerificationState);
  const vstate = useQuery({
    queryKey: ["verification-state", user?.id],
    queryFn: () => fetchState(),
    enabled: Boolean(user),
    retry: false,
  });
  const cta = vstate.isLoading ? null : verificationCta(vstate.data);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [avatarSource, setAvatarSource] = useState("");
  const [fetching, setFetching] = useState(false);

  const applyAvatarSource = async () => {
    const raw = avatarSource.trim();
    if (!raw) return;
    setFetching(true);
    try {
      if (raw.includes("@") && !raw.startsWith("http")) {
        const url = await gravatarUrl(raw);
        const res = await fetch(url, { method: "GET", mode: "cors" }).catch(() => null);
        if (!res || !res.ok) {
          toast.error(t("studio.basic.noGravatar"));
          return;
        }
        onAvatarUrlChange(url);
        toast.success(t("studio.basic.gravatarOk"));
        return;
      }
      if (!/^https?:\/\//i.test(raw)) {
        toast.error(t("studio.basic.needHttps"));
        return;
      }
      onAvatarUrlChange(raw);
      toast.success(t("studio.basic.avatarOk"));
    } finally {
      setFetching(false);
    }
  };

  const savedRecently = Boolean(savedAt) && Date.now() - (savedAt ?? 0) < 60_000;

  return (
    <AccordionItem
      value="profile_info"
      className="rounded-2xl border border-border bg-card px-4 sm:px-5"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="profile" />{t("studio.basic.title").replace(/^\p{Extended_Pictographic}\s*/u, "")}</span>
          <span className="text-[11px] text-muted-foreground">
            {saving ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t("studio.basic.saving")}
              </span>
            ) : savedRecently ? (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <Check className="h-3 w-3" aria-hidden /> {t("studio.basic.saved")}
              </span>
            ) : null}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="space-y-4 pb-5">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="w-full space-y-3 sm:max-w-xs">
              <AvatarUpload
                value={avatarUrl || null}
                name={displayName}
                onChange={(url) => onAvatarUrlChange(url ?? "")}
              />
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {t("studio.basic.gravatarLabel")}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={avatarSource}
                    placeholder={t("studio.basic.sourcePlaceholder")}
                    onChange={(e) => setAvatarSource(e.target.value)}
                    className="input-field h-9 rounded-xl text-xs"
                    aria-label={t("studio.basic.sourceAria")}
                  />
                  <button
                    type="button"
                    disabled={fetching}
                    onClick={() => void applyAvatarSource()}
                    className="shrink-0 rounded-xl border border-border px-3 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {fetching ? "…" : t("studio.basic.fetch")}
                  </button>
                </div>
              </div>

            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {t("studio.basic.displayName")}
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {displayName.length}/{MAX_DISPLAY_NAME}
                  </span>
                </div>
                <Input
                  value={displayName}
                  maxLength={MAX_DISPLAY_NAME}
                  placeholder="Jona Zeno"
                  onChange={(e) => onDisplayNameChange(e.target.value.slice(0, MAX_DISPLAY_NAME))}
                  className="input-field h-10 rounded-xl"
                  aria-label={t("studio.basic.displayName")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  rout.be{styledProfilePath(normalized || "handle", urlStyle)}
                </span>
                <button
                  type="button"
                  onClick={onEditHandle}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                >
                  {t("studio.basic.editHandle")}
                </button>
                {cta === "verified" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium">
                    <BadgeCheck className="h-3 w-3 text-primary" aria-hidden /> {t("studio.basic.verified")}
                  </span>
                ) : cta === "pending" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden /> {t("studio.basic.pending")}
                  </span>
                ) : cta === "request" ? (
                  <button
                    type="button"
                    onClick={() => setVerifyOpen(true)}
                    className="shrink-0 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
                  >
                    {t("studio.basic.requestVerify")}
                  </button>
                ) : null}
                <VerifiedModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `https://rout.be${styledProfilePath(normalized || "handle", urlStyle)}`,
                    );
                    toast.success(t("studio.basic.copied"));
                  }}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                >
                  {t("studio.basic.copyLink")}
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden /> {t("studio.basic.location")}
                  </label>
                  <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                    {t("studio.basic.visible")}
                    <Switch
                      checked={prefs.locationVisible}
                      onCheckedChange={(v) => setPref("locationVisible", v)}
                      aria-label={t("studio.basic.locationAria")}
                    />
                  </span>
                </div>
                <Input
                  value={prefs.locationBadge ?? ""}
                  maxLength={60}
                  placeholder={t("studio.basic.locationPlaceholder")}
                  onChange={(e) => setPref("locationBadge", e.target.value || null)}
                  className="input-field h-10 rounded-xl"
                  aria-label={t("studio.basic.location")}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {t("studio.basic.bio")}
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {tagline.length}/{MAX_BIO}
                  </span>
                </div>
                <Textarea
                  value={tagline}
                  maxLength={MAX_BIO}
                  rows={3}
                  placeholder={t("studio.basic.bioPlaceholder")}
                  onChange={(e) => onTaglineChange(e.target.value.slice(0, MAX_BIO))}
                  className="input-field rounded-xl"
                  aria-label={t("studio.basic.bio")}
                />
                <BioAssistant text={tagline} onApply={onTaglineChange} maxLength={MAX_BIO} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-muted"
                    aria-expanded={emojiOpen}
                  >
                    <Smile className="h-3 w-3" aria-hidden /> Emoji
                  </button>
                  {emojiOpen &&
                    EMOJI_QUICK_PICK.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() =>
                          onTaglineChange(`${tagline}${emoji}`.slice(0, MAX_BIO))
                        }
                        className="rounded-lg border border-border px-1.5 py-0.5 text-sm hover:bg-muted"
                        aria-label={`Emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </AccordionContent>
    </AccordionItem>
  );
}
