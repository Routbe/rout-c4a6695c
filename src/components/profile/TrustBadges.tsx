import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { PioneerEmblem } from "./PioneerEmblem";
import { TrustBadgeModal, TrustRow } from "./TrustBadgeModal";

type Theme = { border: string; text: string; muted: string };

function fmt(iso: string | null | undefined, locale: string, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, withTime
    ? { dateStyle: "long", timeStyle: "medium", timeZone: "UTC" }
    : { month: "long", year: "numeric" }).format(d) + (withTime ? " UTC" : "");
}

/** System "Lid sinds" badge, derived from the account's creation date. Opens Account Genesis. */
export function MemberSinceBadge({ createdAt, stamp, label, locale, theme }: { createdAt: string | null; stamp: string | null; label: string; locale: string; theme: Theme }) {
  const [open, setOpen] = useState(false);
  if (!createdAt) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        style={{ border: `1px solid ${theme.border}`, color: theme.muted }}
      >
        <CalendarClock className="h-3 w-3" aria-hidden /> {label} {fmt(createdAt, locale)}
      </button>
      <TrustBadgeModal
        open={open}
        onClose={() => setOpen(false)}
        icon={<CalendarClock className="h-5 w-5" aria-hidden />}
        title="ROUT Account Genesis"
        description="Officieel geregistreerd ROUT-lid."
      >
        <dl>
          <TrustRow label="Geregistreerd" value={fmt(createdAt, locale, true)} />
          <TrustRow label="Genesis-stempel" value={stamp ?? "—"} mono />
          <TrustRow label="Bron" value="ROUT-systeem, niet aanpasbaar" />
        </dl>
      </TrustBadgeModal>
    </>
  );
}

/** Early Believer emblem next to the name; opens the Pioneer modal. */
export function PioneerBadge({ badgeId, grantedAt, fallbackDate, locale, theme, variant = "inline" }: {
  badgeId: string | null; grantedAt: string | null; fallbackDate: string | null; locale: string; theme: Theme; variant?: "inline" | "stamp";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "inline" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Early Believer & Pioneer Member"
          className="inline-flex items-center transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
          style={{ color: theme.text }}
        >
          <PioneerEmblem className="h-6 w-6" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80"
          style={{ border: `1px solid ${theme.border}`, color: theme.text }}
        >
          <PioneerEmblem className="h-5 w-5" /> Early Believer
        </button>
      )}
      <TrustBadgeModal
        open={open}
        onClose={() => setOpen(false)}
        icon={<PioneerEmblem className="h-6 w-6 text-primary" />}
        title="Early Believer & Pioneer Member"
        description="Dit lid ondersteunde ROUT in de pioniersfase. Dankzij deze vroege steun blijft ROUT 100% onafhankelijk, soeverein en privacy-first."
      >
        <dl>
          <TrustRow label="Toegekend" value={fmt(grantedAt ?? fallbackDate, locale)} />
          <TrustRow label="Badge-id" value={badgeId ?? "—"} mono />
        </dl>
      </TrustBadgeModal>
    </>
  );
}
