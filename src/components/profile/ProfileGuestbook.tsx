import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Pin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getPinnedNotes, postGuestbookNote } from "@/lib/guestbook.functions";
import { GUESTBOOK_MAX } from "@/lib/guestbook-rules";

type Theme = { card: string; border: string; text: string; muted: string };

const MESSAGES: Record<string, string> = {
  invalid: "Schrijf een berichtje van max 150 tekens.",
  not_found: "Dit profiel neemt geen berichten aan.",
  own_profile: "Je kan niet op je eigen prikbord schrijven.",
  too_many: "Even rustig aan — probeer het straks opnieuw.",
  not_verified: "Alleen geverifieerde ROUT-leden kunnen een bericht achterlaten.",
};

/** Prikbord: pinned notes for everyone, a note form for signed-in members. */
export function ProfileGuestbook({ handle, theme }: { handle: string; theme: Theme }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const post = useServerFn(postGuestbookNote);
  const q = useQuery({ queryKey: ["guestbook", handle], queryFn: () => getPinnedNotes({ data: { handle } }), staleTime: 60_000 });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = q.data?.notes ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const { result } = await post({ data: { handle, body } });
      if (result === "ok") {
        setBody("");
        toast.success(t("profile.messageSent"), { description: t("profile.ownerCanPin") });
      } else toast.error(MESSAGES[result] ?? t("profile.sendFailed"));
    } catch {
      toast.error(t("profile.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 w-full max-w-sm rounded-2xl p-3 text-left" style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }} aria-label={t("profile.guestbookTitle")}>
      <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: theme.muted }}>
        <Pin className="h-3 w-3" aria-hidden />  {t("profile.guestbookTitle")} </h2>
      {notes.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {notes.map((n, i) => (
            <li key={n.id} className="rounded-xl p-2.5 text-sm" style={{ border: `1px dashed ${theme.border}`, transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>
              <p className="break-words">{n.body}</p>
              {n.author.username && <p className="mt-1 text-[11px]" style={{ color: theme.muted }}>— @{n.author.username}</p>}
            </li>
          ))}
        </ul>
      )}
      {user ? (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, GUESTBOOK_MAX))}
            maxLength={GUESTBOOK_MAX}
            rows={2}
            placeholder={t("profile.leaveMessage")}
            aria-label={t("profile.guestbookMessage")}
            className="w-full resize-none rounded-lg bg-transparent px-2.5 py-1.5 text-sm outline-none"
            style={{ border: `1px solid ${theme.border}` }}
          />
          <span className="flex items-center justify-between text-[11px]" style={{ color: theme.muted }}>
            {body.length}/{GUESTBOOK_MAX}
            <button type="submit" disabled={busy || !body.trim()} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ background: theme.text, color: theme.card }}>
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}  {t("profile.post")} </button>
          </span>
        </form>
      ) : (
        <p className="mt-2 text-xs" style={{ color: theme.muted }}>
          <Link to="/auth" className="underline"> {t("profile.loginRout")} </Link>  {t("profile.toLeaveMessage")} </p>
      )}
    </section>
  );
}
