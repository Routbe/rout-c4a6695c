import { useEffect, useState } from "react";

/**
 * Cycles through phrases with a typing/erasing effect. Only the placeholder
 * text changes, so the input never reflows. Respects reduced motion.
 */
export function useTypingPlaceholder(phrases: readonly string[], paused = false): string {
  const [text, setText] = useState(phrases[0] ?? "");

  useEffect(() => {
    if (paused || phrases.length === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      let i = 0;
      const id = window.setInterval(() => setText(phrases[(i = (i + 1) % phrases.length)]!), 2600);
      return () => window.clearInterval(id);
    }
    let phrase = 0;
    let chars = 0;
    let erasing = false;
    let timer = 0;
    const tick = () => {
      const full = phrases[phrase]!;
      if (!erasing) {
        chars++;
        setText(full.slice(0, chars));
        if (chars >= full.length) {
          erasing = true;
          timer = window.setTimeout(tick, 1600);
          return;
        }
        timer = window.setTimeout(tick, 55 + Math.random() * 45);
      } else {
        chars--;
        setText(full.slice(0, chars));
        if (chars <= 0) {
          erasing = false;
          phrase = (phrase + 1) % phrases.length;
          timer = window.setTimeout(tick, 350);
          return;
        }
        timer = window.setTimeout(tick, 28);
      }
    };
    chars = 0;
    setText("");
    timer = window.setTimeout(tick, 400);
    return () => window.clearTimeout(timer);
  }, [phrases, paused]);

  return text;
}
