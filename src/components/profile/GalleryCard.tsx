import { galleryImageSrc } from "@/lib/image-proxy-rules";
import { useTranslation } from "react-i18next";
import { useState, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { galleryLinkHref, type GalleryConfig, type GalleryItem } from "@/lib/gallery";
import { cn } from "@/lib/utils";

/** Lazy-loaded foto met blur-up placeholder. */
function GalleryImage({
  item,
  className,
  onClick,
}: {
  item: GalleryItem;
  className?: string;
  onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const href = galleryLinkHref(item);

  const image = (
    <img
      src={galleryImageSrc(item.url) ?? undefined}
      alt={item.alt || item.caption || ""}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        "h-full w-full object-cover transition-all duration-500",
        loaded ? "blur-0 scale-100 opacity-100" : "scale-105 opacity-0 blur-md",
        className,
      )}
    />
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
        {image}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block h-full w-full cursor-zoom-in">
        {image}
      </button>
    );
  }
  return image;
}

/**
 * Publieke renderer voor het `media_gallery`-blok: lijst, grid, carousel of
 * showcase met lightbox.
 */
export function GalleryCard({ config, style }: { config: GalleryConfig; style: CSSProperties }) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [featured, setFeatured] = useState(0);
  const items = config.items;
  if (items.length === 0) return null;

  const hero = items[Math.min(featured, items.length - 1)]!;

  return (
    <div style={style} className="w-full overflow-hidden p-4 text-left">
      {config.title.trim() !== "" && (
        <h3 className="mb-3 text-sm font-semibold tracking-tight">{config.title}</h3>
      )}

      {config.layout === "list" && (
        <div className="space-y-3">
          {items.map((item) => (
            <figure key={item.id} className="overflow-hidden rounded-2xl">
              <div className="aspect-[4/3] w-full overflow-hidden bg-current/5">
                <GalleryImage item={item} onClick={() => setLightbox(item)} />
              </div>
              {item.caption && (
                <figcaption className="px-1 pt-2 text-xs opacity-70">{item.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {config.layout === "grid" && (
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="aspect-square overflow-hidden rounded-xl bg-current/5">
              <GalleryImage item={item} onClick={() => setLightbox(item)} />
            </div>
          ))}
        </div>
      )}

      {config.layout === "carousel" && (
        <div className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {items.map((item) => (
            <figure key={item.id} className="w-40 shrink-0 snap-start sm:w-48">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-current/5">
                <GalleryImage item={item} onClick={() => setLightbox(item)} />
              </div>
              {item.caption && (
                <figcaption className="truncate pt-2 text-xs opacity-70">{item.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {config.layout === "showcase" && (
        <div className="space-y-2">
          <figure>
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl bg-current/5">
              <GalleryImage item={hero} onClick={() => setLightbox(hero)} />
            </div>
            {hero.caption && (
              <figcaption className="px-1 pt-2 text-xs opacity-70">{hero.caption}</figcaption>
            )}
          </figure>
          {items.length > 1 && (
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFeatured(index)}
                  aria-label={item.alt || item.caption || t("profile.photoNumber", { number: index + 1 })}
                  className={cn(
                    "h-14 w-14 shrink-0 overflow-hidden rounded-lg transition-opacity",
                    index === featured ? "opacity-100 ring-2 ring-current" : "opacity-60",
                  )}
                >
                  <img
                    src={galleryImageSrc(item.url) ?? undefined}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {lightbox?.caption || lightbox?.alt || t("profile.photo")}
          </DialogTitle>
          {lightbox && (
            <figure className="overflow-hidden rounded-2xl">
              <img
                src={galleryImageSrc(lightbox.url) ?? undefined}
                alt={lightbox.alt || lightbox.caption || ""}
                className="max-h-[80vh] w-full object-contain"
              />
              {lightbox.caption && (
                <figcaption className="bg-background/90 p-3 text-center text-sm text-foreground">
                  {lightbox.caption}
                </figcaption>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
