import { BookOpen } from "lucide-react";
import { Link } from "@/lib/router-compat";
export function DocHelpLink({ to, children = "Lees de gids" }: { to: string; children?: React.ReactNode }) {
  return <Link to={to} className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><BookOpen className="size-3.5 shrink-0" aria-hidden /><span>{children}</span></Link>;
}
