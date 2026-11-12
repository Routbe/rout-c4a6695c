import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { countdownParts, countdownTarget } from "@/lib/profile";

/**
 * Countdown to one moment (a launch, an event). Purely local: no external
 * service. The numbers render only after hydration so server and browser agree.
 */
export function CountdownCard({ label, value, style }: { label: string; value: string; style: CSSProperties | undefined }) {
  const { t } = useTranslation();
  const target = countdownTarget(value);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (target === null) return null;
  const parts = now === null ? null : countdownParts(target, now);
  const units = [
    { key: "days", value: parts?.days },
    { key: "hours", value: parts?.hours },
    { key: "minutes", value: parts?.minutes },
    { key: "seconds", value: parts?.seconds },
  ] as const;
  const when = new Date(target);
  return (
    <section className="flex w-full flex-col items-center gap-2 px-4 py-4 text-center" style={style} aria-label={label || t("profile.countdown.title")}>
      {label && <p className="text-sm font-medium">{label}</p>}
      {parts?.done ? (
        <p className="text-sm font-semibold">{t("profile.countdown.done")}</p>
      ) : (
        <div className="grid w-full max-w-xs grid-cols-4 gap-2" role="timer" aria-live="off">
          {units.map((u) => (
            <div key={u.key} className="flex flex-col items-center rounded-lg border border-current/15 py-2">
              <span className="font-mono text-xl font-semibold tabular-nums">{u.value === undefined ? "–" : String(u.value).padStart(2, "0")}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-70">{t(`profile.countdown.${u.key}`)}</span>
            </div>
          ))}
        </div>
      )}
      <time dateTime={when.toISOString()} className="text-[11px] opacity-70">
        {now === null ? when.toISOString().slice(0, 16).replace("T", " ") : when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </time>
    </section>
  );
}
