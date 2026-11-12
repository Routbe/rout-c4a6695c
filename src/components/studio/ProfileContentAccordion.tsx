import { useTranslation } from "react-i18next";
import { type Dispatch, type SetStateAction, useState } from "react";
import { Plus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProfileLinksManager } from "@/components/dashboard/editor/ProfileLinksManager";
import { AddComponentModal } from "@/components/studio/AddComponentModal";
import { scheduledBlocks, type ProfileBlock, type ProfileLinkMode } from "@/lib/profile";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { ProfileImportCard } from "./ProfileImportCard";
import { Switch } from "@/components/ui/switch";

interface Props {
  cardEffects: boolean;
  onCardEffectsChange: (value: boolean) => void;
  blocks: ProfileBlock[];
  onBlocksChange: Dispatch<SetStateAction<ProfileBlock[]>>;
  openBlock: string | null;
  onOpenBlockChange: (id: string | null) => void;
  onOpenAddDrawer: () => void;
  /** Voegt een blok van dit type toe en opent het meteen. */
  onAddKind: (kind: string, value?: string) => void;
  /** Profielhandle voor bio-verificatie in de kluis. */
  handle?: string;
  /** Import: take over name/subtitle from a restored export. */
  onImportMeta?: (meta: { displayName: string | null; tagline: string | null }) => void;
  /** Profile-wide link display (default for each link's button/logo choice). */
  linkMode?: ProfileLinkMode;
  /** City from the profile location badge. */
  profileCity?: string | null;
}

/**
 * 🔗 Links & Inhoudscomponenten.
 *
 * Bundelt de sleepbare linklijst, de rijke componentbibliotheek en alle
 * bijhorende secties. Elke wijziging is meteen zichtbaar in de live preview.
 */
export function ProfileContentAccordion({
  cardEffects,
  onCardEffectsChange,
  blocks,
  onBlocksChange,
  openBlock,
  onOpenBlockChange,
  onOpenAddDrawer,
  onAddKind,
  handle,
  onImportMeta,
  linkMode,
  profileCity,
}: Props) {
  const { t } = useTranslation();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const live = scheduledBlocks(blocks).length;

  return (
    <AccordionItem
      value="components_list"
      className="acrylic-card px-4 sm:px-5"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="content" />{t("studio.content.title").replace(/^\p{Extended_Pictographic}\s*/u, "")}</span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {t("studio.content.visible", { count: live })}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
        <Button variant="outline"
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="min-h-12 w-full gap-2 text-sm"
        >
          <Plus className="h-4 w-4" aria-hidden /> {t("studio.content.add")} </Button>
        <AddComponentModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onAdd={onAddKind}
          handle={handle}
        />
        <Button variant="ghost" className="h-auto min-h-10 w-full justify-start gap-2 text-left" onClick={() => {
          const grid = blocks.find((block) => block.kind === "social_grid");
          if (grid) onOpenBlockChange(grid.id);
          else onAddKind("social_grid");
        }}>
          <LayoutGrid className="h-4 w-4" /> {t("studio.grid.heading")}
        </Button>

        <ProfileLinksManager
          blocks={blocks}
          onBlocksChange={onBlocksChange}
          openBlock={openBlock}
          onOpenBlockChange={onOpenBlockChange}
          onOpenAddDrawer={onOpenAddDrawer}
          linkMode={linkMode}
          profileCity={profileCity}
        />
        <ProfileImportCard blocks={blocks} onBlocksChange={onBlocksChange} onImportMeta={onImportMeta} />
        <details className="space-y-3 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">{t("studio.content.cardSettings")}</summary>
          <div className="flex items-start justify-between gap-4 pt-3">
            <div className="min-w-0"><p className="text-sm font-medium">{t("studio.effects.title")}</p><p className="text-sm text-muted-foreground">{t("studio.effects.help")}</p></div>
            <Switch aria-label={t("studio.effects.title")} checked={cardEffects} onCheckedChange={onCardEffectsChange} />
          </div>
        </details>

      </AccordionContent>
    </AccordionItem>
  );
}
