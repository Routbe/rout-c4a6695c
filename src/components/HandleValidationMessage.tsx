/**
 * Rood uitroepteken-waarschuwing voor ongeldige handles.
 * Gedeeld door onboarding, Studio en het adminportaal.
 */
import { strictHandleIssue, type StrictHandleOptions } from "@/lib/handle-validation";
import { cn } from "@/lib/utils";

interface HandleValidationMessageProps extends StrictHandleOptions {
  /** Ruwe invoer van de gebruiker. */
  handle: string;
  /** Extra melding (bv. "handle is al bezet") die dezelfde stijl krijgt. */
  extraMessage?: string | null;
  className?: string;
}

/** Losse banner voor een reeds bekende foutmelding. */
export function HandleErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-500",
        className,
      )}
    >
      <span aria-hidden className="text-base leading-none">
        ❗
      </span>
      <span className="min-w-0 flex-1 break-words">
        {message.replace(/^(?:❗|⚠️|🔴)+\s*/u, "")}
      </span>
    </div>
  );
}

/**
 * Toont niets bij een geldige handle; anders een rode blokkerende melding.
 * Gebruik `strictHandleIssue` in de parent om de opslaanknop te blokkeren.
 */
export function HandleValidationMessage({
  handle,
  alias,
  extraMessage,
  className,
}: HandleValidationMessageProps) {
  const issue = strictHandleIssue(handle, { alias }) ?? extraMessage ?? null;
  if (!issue) return null;
  return <HandleErrorBanner message={issue} className={className} />;
}

export default HandleValidationMessage;
