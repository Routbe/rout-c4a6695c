import type { ReactNode } from "react";

/**
 * Minimal inline renderer for the legal dictionary strings.
 *
 * Supports `**bold**` plus automatic linking of `contact@rout.be` and bare
 * `rout.be`, so the translated content can stay plain, type-safe strings.
 */
const PATTERN = /(\*\*[^*]+\*\*|contact@rout\.be|\brout\.be\b)/g;

export function LegalRichText({ text }: { text: string }) {
  const parts = text.split(PATTERN).filter(Boolean);

  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <span key={i} className="font-medium text-foreground">
              {part.slice(2, -2)}
            </span>
          );
        }
        if (part === "contact@rout.be") {
          return (
            <a
              key={i}
              href="mailto:contact@rout.be"
              className="rounded font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              contact@rout.be
            </a>
          );
        }
        if (part === "rout.be") {
          return (
            <a
              key={i}
              href="https://rout.be"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              rout.be
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
