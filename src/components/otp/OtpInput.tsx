import { useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last slot is filled — used for auto-submit. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Verification-code input: one slot per digit, laid out on a strict grid so
 * nothing overlaps at any width. Typing advances, Backspace walks back, paste
 * fills the row, and a full code triggers `onComplete`.
 */
export function OtpInput({
  id,
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  className,
  ariaLabel = "Verification code",
}: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const completedFor = useRef<string | null>(null);

  const digits = value.replace(/\D/g, "").slice(0, length);
  const chars = Array.from({ length }, (_, i) => digits[i] ?? "");
  const complete = digits.length === length;

  const focusIndex = useCallback((index: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(index, inputsRef.current.length - 1))];
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => el.select());
  }, []);

  const update = useCallback(
    (next: string) => {
      const cleaned = next.replace(/\D/g, "").slice(0, length);
      if (cleaned !== digits) onChange(cleaned);
    },
    [digits, length, onChange],
  );

  // Auto-submit exactly once per complete code.
  useEffect(() => {
    if (!complete) {
      completedFor.current = null;
      return;
    }
    if (completedFor.current === digits) return;
    completedFor.current = digits;
    onComplete?.(digits);
  }, [complete, digits, onComplete]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (disabled) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index]) {
        update(digits.slice(0, index) + digits.slice(index + 1));
      } else if (index > 0) {
        const prev = index - 1;
        update(digits.slice(0, prev) + digits.slice(prev + 1));
        focusIndex(prev);
      }
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      update(digits.slice(0, index) + digits.slice(index + 1));
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusIndex(index - 1);
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusIndex(index + 1);
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      update(digits.slice(0, index) + e.key + digits.slice(index + 1));
      if (index < length - 1) focusIndex(index + 1);
      return;
    }

    if (
      ["Tab", "Enter", "Escape", "Meta", "Control", "Alt", "Shift", "Home", "End"].includes(
        e.key,
      ) ||
      e.key.startsWith("Arrow") ||
      e.metaKey ||
      e.ctrlKey
    ) {
      return;
    }
    e.preventDefault();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    update(pasted);
    focusIndex(pasted.length >= length ? length - 1 : pasted.length);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    // Mobile keyboards and autofill deliver whole strings here.
    const typed = e.target.value.replace(/\D/g, "");
    if (!typed) return;
    if (typed.length > 1) {
      update(digits.slice(0, index) + typed.slice(0, length - index));
      focusIndex(Math.min(index + typed.length, length - 1));
      return;
    }
    update(digits.slice(0, index) + typed + digits.slice(index + 1));
    if (index < length - 1) focusIndex(index + 1);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-invalid={invalid ? "true" : undefined}
      className={cn("flex w-full items-center justify-center gap-1.5 sm:gap-2", className)}
    >
      {chars.map((char, index) => (
        <div key={index} className="flex shrink-0 items-center">
          <input
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            id={index === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            pattern="[0-9]*"
            maxLength={1}
            value={char}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onFocus={(e) => e.currentTarget.select()}
            onPaste={handlePaste}
            className={cn(
              "h-12 w-9 shrink-0 sm:h-14 sm:w-11",
              "rounded-xl border-2 bg-card text-center font-display text-xl leading-none sm:text-2xl",
              "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
              "focus:border-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/30",
              char ? "border-foreground/70 bg-muted/40" : "border-border",
              complete && !invalid && "border-foreground bg-accent/30",
              invalid && "border-destructive bg-destructive/5 text-destructive",
              disabled && "cursor-not-allowed opacity-50",
            )}
          />
          {index === Math.floor(length / 2) - 1 && (
            <span
              aria-hidden
              className="mx-1 h-[2px] w-2 shrink-0 rounded-full bg-muted-foreground/40 sm:mx-2 sm:w-3"
            />
          )}
        </div>
      ))}
    </div>
  );
}
