import { SocialPlatformIcon } from "@/lib/social-icons";
import {
  extractHandle,
  handlePrefix,
  handleValidationError,
  normalizeSocialHandle,
  socialUrl,
} from "@/lib/social-handles";
import { brandOf } from "@/lib/profile";
import { cn } from "@/lib/utils";

interface Props {
  /** Platform-identifier, bv. "instagram". */
  kind: string;
  /** Zichtbaar platformlabel, bv. "Instagram". */
  label?: string;
  /** Pure handle zonder `@`. */
  value: string;
  onChange: (handle: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Handle-invoerveld met vast platformprefix (`instagram.com/`) en smart paste:
 * een geplakte volledige URL wordt automatisch tot de gebruikersnaam herleid.
 */
export function SocialHandleInput({
  kind,
  label,
  value,
  onChange,
  placeholder = "gebruikersnaam",
  disabled,
  className,
}: Props) {
  const prefix = handlePrefix(kind) ?? "";
  const normalized = normalizeSocialHandle(value);
  const error = handleValidationError(kind, value);
  const preview = error ? "" : socialUrl(kind, normalized);

  return (
    <div className="min-w-0 space-y-1">
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-foreground/40",
          disabled && "opacity-60",
          className,
        )}
      >
        <span className="shrink-0" style={{ color: brandOf(kind) }} aria-hidden>
          <SocialPlatformIcon source={kind} className="h-4 w-4 text-current" />
        </span>
        {prefix !== "@" && (
          <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
            {prefix.replace(/@$/, "")}
          </span>
        )}
        <span className="shrink-0 select-none text-sm font-medium text-muted-foreground" aria-hidden>
          @
        </span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          maxLength={200}
          aria-label={label ? `${label} gebruikersnaam` : "Gebruikersnaam"}
          placeholder={placeholder}
          value={value}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (!pasted) return;
            e.preventDefault();
            onChange(normalizeSocialHandle(extractHandle(kind, pasted)));
          }}
          onBlur={(e) => onChange(normalizeSocialHandle(extractHandle(kind, e.target.value)))}
          onChange={(e) => onChange(normalizeSocialHandle(extractHandle(kind, e.target.value)))}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {kind === "wsocial" && normalized && !normalized.includes(".") && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">.wsocial.eu</span>
        )}
      </div>

      {error ? (
        <p className="text-[11px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : preview ? (
        <p className="truncate text-[11px] text-muted-foreground">
          <span aria-hidden>{"\uD83D\uDD17"}</span> Live preview:{" "}
          <a
            href={preview}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {preview}
          </a>
        </p>
      ) : null}
    </div>
  );
}
