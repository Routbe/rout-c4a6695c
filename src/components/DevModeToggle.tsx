import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { canSwitchShellMode, detectShellMode, isAdminPath, MODE_OVERRIDE_KEY, type ShellMode } from "@/lib/app-mode";
import { cn } from "@/lib/utils";

/** Floating [Publiek] / [Admin] switch for development and previews; never on pinned builds. */
export function DevModeToggle() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(canSwitchShellMode()), []);
  if (!visible) return null;
  // The admin sign-in lives on /auth too, so the stored override decides there.
  const active: ShellMode = isAdminPath(path) || (path.startsWith("/auth") && detectShellMode() === "admin") ? "admin" : "public";

  const pick = (mode: ShellMode) => {
    try {
      window.localStorage.setItem(MODE_OVERRIDE_KEY, mode);
    } catch {
      /* storage blocked */
    }
    if (mode === "public" && path.startsWith("/auth")) window.location.assign("/auth/sign-in");
    else void navigate({ to: mode === "admin" ? "/admin" : "/" } as never);
  };

  return (
    <div role="group" aria-label="Weergave wisselen" className="fixed bottom-4 right-4 z-[100] flex items-center gap-1 rounded-full border-2 border-primary bg-background p-1 text-sm font-medium shadow-xl">
      <span className="px-2 text-xs uppercase tracking-wide text-muted-foreground">Omgeving</span>
      {(["public", "admin"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={active === m}
          onClick={() => pick(m)}
          className={cn("rounded-full px-3 py-1", active === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {m === "public" ? "Publiek" : "Admin"}
        </button>
      ))}
    </div>
  );
}
