import type { Link2 } from "lucide-react";

export type ProfileVariant = "verified" | "alias";

export type StudioTab = "links" | "design" | "analytics" | "identity" | "settings";

export interface StudioTabDef {
  id: StudioTab;
  label: string;
  icon: typeof Link2;
  verifiedOnly?: boolean;
}

export interface QuickCreateOption {
  kind: "link" | "__socials" | "__fediverse" | "vcard";
  label: string;
}

export interface RangeOption {
  id: "7d" | "30d" | "all";
  label: string;
  days: number | null;
}
