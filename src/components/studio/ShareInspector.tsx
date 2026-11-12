import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import { profilePreviewPath } from "@/lib/profile-preview";
import { ShareImageFormats } from "@/components/studio/ShareImageFormats";

interface Props {
  prefs: ProfileDisplayPrefs;
  onPrefChange: <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
  displayName: string | null;
  bio: string | null;
  /** Publieke handle; bepaalt de automatisch gegenereerde preview-kaart. */
  handle?: string;
  space?: "root" | "alias" | "workspace";
}

/**
 * Meta title, description and share image, with a link-preview mock-up.
 * Zonder eigen overrides maakt ROUT automatisch een unieke kaart per lid
 * (/api/public/og/<handle>.png) op basis van profielnaam, bio en profielfoto.
 */
export function ShareInspector({ prefs, onPrefChange, displayName, bio, handle, space }: Props) {
  const { t } = useTranslation();
  const autoImage = handle ? profilePreviewPath(handle, space) : null;
  const previewImage = prefs.ogImageUrl?.trim() || autoImage;
  const autoTitle = `${displayName?.trim() || t("studio.share.profile")}${handle ? ` (@${handle})` : ""} — ROUT`;
  return (
        <section className="space-y-2">
          <p className="text-xs font-medium">{t("studio.share.title")}</p>
          <p className="text-[11px] text-muted-foreground"> {t("studio.share.help")} </p>
          <Input
            id="coach-meta-title"
            value={prefs.metaTitle ?? ""}
            maxLength={70}
            placeholder={autoTitle}
            aria-label={t("studio.share.metaTitle")}
            onChange={(e) => onPrefChange("metaTitle", e.target.value || null)}
            className="h-9 text-xs"
          />
          <Textarea
            value={prefs.metaDescription ?? ""}
            maxLength={200}
            placeholder={bio?.trim() || t("studio.share.autoDescription")}
            aria-label={t("studio.share.metaDescription")}
            onChange={(e) => onPrefChange("metaDescription", e.target.value || null)}
            className="min-h-16 text-xs"
          />
          <Input
            value={prefs.ogImageUrl ?? ""}
            placeholder={t("studio.share.imagePlaceholder")}
            aria-label={t("studio.share.image")}
            spellCheck={false}
            onChange={(e) => onPrefChange("ogImageUrl", e.target.value || null)}
            className="h-9 text-xs"
          />
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="aspect-[1.91/1] w-full bg-muted">
              {previewImage ? (
                <img
                  src={previewImage}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className="space-y-0.5 p-2">
              <p className="truncate text-xs font-medium">
                {prefs.metaTitle || autoTitle}
              </p>
              <p className="line-clamp-2 text-[11px] text-muted-foreground">
                {prefs.metaDescription || bio || t("studio.share.descriptionHint")}
              </p>
              {!prefs.ogImageUrl && autoImage && (
                <p className="text-[10px] text-muted-foreground">{t("studio.share.autoImage")}</p>
              )}
            </div>
          </div>
          {handle ? <ShareImageFormats handle={handle} space={space ?? "root"} isPublic={space === "workspace" || prefs.publicProfile} /> : null}
        </section>
  );
}
