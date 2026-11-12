import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { getMyDisplayName, setMyDisplayName } from "@/lib/signup-profile.functions";
import { getMyHandle } from "@/lib/claim.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Progressive profiling: passwordless sign-in only ever gives us an e-mail
 * address, so the very first time a member lands with an empty display name we
 * ask for it once — non-blocking, dismissible, and never shown again after it
 * is answered.
 */
export function NameOnboardingDialog() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const getMyDisplayNameFn = useServerFn(getMyDisplayName);
  const setMyDisplayNameFn = useServerFn(setMyDisplayName);
  const getMyHandleFn = useServerFn(getMyHandle);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // The handle claim is the real onboarding step; the name question is a
  // nicety layered on top of it. It is therefore never asked while a member
  // still has no handle, and never on the claim screen itself.
  const onClaimScreen = pathname.startsWith("/claim");

  useEffect(() => {
    if (loading || !user || onClaimScreen) return;
    let active = true;
    void (async () => {
      try {
        const [{ displayName }, { handle }] = await Promise.all([
          getMyDisplayNameFn(),
          getMyHandleFn().catch(() => ({ handle: null as string | null })),
        ]);
        if (!active) return;
        if (!handle) {
          // No handle yet: skip the name modal entirely and continue into the
          // handle claim instead of parking the member behind a dialog.
          void navigate({ to: "/claim", replace: true } as never);
          return;
        }
        if ((displayName ?? "").trim()) return;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const guess = typeof meta["full_name"] === "string" ? meta["full_name"] : "";
        setName(guess);
        setOpen(true);
      } catch {
        /* profile unreachable — never block the app on a nicety */
      }
    })();
    return () => {
      active = false;
    };
  }, [user, loading, onClaimScreen, getMyDisplayNameFn, getMyHandleFn, navigate]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!user || value.length < 2) return;
    setSaving(true);
    try {
      await setMyDisplayNameFn({ data: { displayName: value } });
      setOpen(false);
    } catch {
      // A failed save must not trap the member in the dialog.
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!user || onClaimScreen) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>What should we call you?</DialogTitle>
          <DialogDescription>
            Your name appears on your public profile and in the e-mails we send you. You can change
            it any time in settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-name">Name</Label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              maxLength={80}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Not now
            </button>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
