import { BarChart3, Globe, Link2, Palette, Settings } from "lucide-react";
import { BLOCK_KINDS } from "@/lib/profile";
import type { RangeOption, StudioTabDef } from "@/types/profile-editor";

/**
 * `verifiedOnly` tabs are hidden entirely for free members: subdomains,
 * Bluesky handles and e-mail aliases are all entitlements that only exist
 * once a profile is verified, so showing an empty locked tab is just noise.
 */
export const TABS: StudioTabDef[] = [
  { id: "links", label: "Links & components", icon: Link2 },
  { id: "design", label: "Design & styling", icon: Palette },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "identity", label: "Domains & Bluesky", icon: Globe, verifiedOnly: true },
  { id: "settings", label: "Settings & verified", icon: Settings },
];

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: null },
] as const;

/** Smart input hint per component type. */
export function inputHint(kind: string): { prefix?: string; help: string } {
  const def = BLOCK_KINDS.find((k) => k.kind === kind);
  if (def?.base)
    return {
      prefix: def.base.replace(/^https?:\/\//, ""),
      help: "Enter just your handle or username — we build the link.",
    };
  switch (kind) {
    case "email":
      return { help: "E-mail address — becomes a mailto: link." };
    case "phone":
    case "whatsapp":
    case "whatsapp_chat":
      return { help: "Phone number in international format (+1…)." };
    case "matrix":
      return { help: "Matrix ID in the format @user:server." };
    case "lightning":
      return { help: "Lightning address, e.g. jona@getalby.com." };
    case "evm":
      return { help: "Public wallet address (0x…)." };
    case "location":
      return { help: "Full address — becomes a map link." };
    default:
      return { help: "Full URL including https://." };
  }
}
