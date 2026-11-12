import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RotateCw } from "lucide-react";
import { prefetchProof } from "@/lib/altcha-client";

/**
 * Self-hosted bot check (ALTCHA proof-of-work). No puzzle for people: the
 * browser prepares the proof in the background while the form is filled in.
 * Forms call `takeProof()` at submit; this only warms it up and shows a quiet line.
 */
export function Altcha({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"working" | "ready" | "error">("working");

  const start = useCallback(() => {
    setState("working");
    prefetchProof()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={start}
        className={`mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline ${className}`}
      >
        <RotateCw className="h-3 w-3" aria-hidden />
        {t("auth.altcha.retry")}
      </button>
    );
  }

  return (
    <p className={`mt-2 flex items-center gap-1.5 text-xs text-muted-foreground ${className}`} aria-live="polite">
      <ShieldCheck className={`h-3 w-3 ${state === "ready" ? "text-primary" : "opacity-60"}`} aria-hidden />
      {t("auth.altcha.status")}
    </p>
  );
}
