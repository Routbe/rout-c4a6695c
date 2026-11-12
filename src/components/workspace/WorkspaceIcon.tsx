import { WORKSPACE_ICONS, resolveWorkspaceIcon } from "@/lib/workspace-icons";
import { cn } from "@/lib/utils";

type Props = {
  avatarUrl?: string | null;
  icon?: string | null;
  category?: string | null;
  className?: string;
  /** Rendered size of the inner glyph. */
  iconClassName?: string;
};

/** Uploaded logo when present, otherwise the chosen or category icon. */
export function WorkspaceIcon({ avatarUrl, icon, category, className, iconClassName }: Props) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn("h-4 w-4 shrink-0 rounded object-cover", className)} />;
  }
  const Glyph = WORKSPACE_ICONS[resolveWorkspaceIcon(icon, category)];
  return <Glyph className={cn("h-4 w-4 shrink-0", className, iconClassName)} aria-hidden />;
}
