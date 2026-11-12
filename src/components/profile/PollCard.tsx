import { useTranslation } from "react-i18next";
import { useEffect, useState, type CSSProperties } from "react";
import { BarChart3 } from "lucide-react";

import { getPollResults, votePoll } from "@/lib/interaction-votes.functions";
import type { PollConfig } from "@/lib/interactions";

const VOTER_STORAGE_KEY = "rout:poll-voter";

/** Anonieme, stabiele stemmer-id in localStorage (geen login nodig). */
function voterKey(): string {
  if (typeof window === "undefined") return "";
  try {
  let key = window.localStorage.getItem(VOTER_STORAGE_KEY);
  if (!key) {
    key = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(VOTER_STORAGE_KEY, key);
  }
  return key;
  } catch {
    // Opera/Brave strict modes can block storage; fall back to a per-session id.
    return `v_${Math.random().toString(36).slice(2)}`;
  }
}

/** Publieke poll: klik om te stemmen, daarna live percentages. */
export function PollCard({
  pollKey,
  config,
  style,
}: {
  pollKey: string;
  config: PollConfig;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const options = config.options.filter((o) => o.trim());
  const [counts, setCounts] = useState<number[] | null>(null);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (typeof window !== "undefined") {
      setVoted(window.localStorage.getItem(`${VOTER_STORAGE_KEY}:${pollKey}`) === "1");
    }
    void getPollResults({ data: { pollKey } })
      .then((r) => active && setCounts(r.counts))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pollKey]);

  if (!config.question.trim() || options.length < 2) return null;

  const total = (counts ?? []).slice(0, options.length).reduce((a, b) => a + b, 0);

  const vote = async (index: number) => {
    if (voted || busy) return;
    setBusy(true);
    try {
      const res = await votePoll({ data: { pollKey, optionIndex: index, voterKey: voterKey() } });
      setCounts(res.counts);
      setVoted(true);
      window.localStorage.setItem(`${VOTER_STORAGE_KEY}:${pollKey}`, "1");
    } catch {
      /* stil falen: de bezoeker ziet gewoon geen update */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200/80 p-4 text-left shadow-sm"
      style={style}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
        {config.question}
      </p>
      <div className="mt-3 space-y-2">
        {options.map((option, i) => {
          const n = counts?.[i] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <button
              key={`${option}-${i}`}
              type="button"
              onClick={() => vote(i)}
              disabled={voted || busy}
              className="relative block w-full overflow-hidden rounded-xl border border-border px-3 py-2 text-left text-sm transition-opacity hover:opacity-90 disabled:cursor-default"
            >
              {voted && (
                <span
                  className="absolute inset-y-0 left-0 bg-current opacity-10"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {voted && <span className="shrink-0 text-xs font-semibold">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      {voted && (
        <p className="mt-2 text-[11px] opacity-70">
          {total} {total === 1 ? t("profile.vote") : t("profile.votes")}
        </p>
      )}
    </div>
  );
}
