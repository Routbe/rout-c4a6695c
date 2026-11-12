import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, CalendarX, Download, Hourglass, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getBookingSummary } from "@/lib/booking-engine/booking.functions";

export default function BookingDone({ bookingId, paid, token }: { bookingId: string; paid: boolean; token?: string }) {
  const { t, locale } = useI18n();
  const get = useServerFn(getBookingSummary);
  const q = useQuery({
    queryKey: ["booking-summary", bookingId, token],
    queryFn: () => get({ data: { id: bookingId, token } }),
    // After Stripe, the webhook may land a moment later: poll briefly while payment is pending.
    refetchInterval: (query) => (query.state.data?.status === "pending_payment" ? 3000 : false),
  });
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  const b = q.data;
  return (
    <AppLayout>
      <div className="mx-auto max-w-lg py-10">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm">
          {q.isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : !b ? (
            <p className="text-muted-foreground">{t("booking.public.notFound")}</p>
          ) : (
            <>
              {b.status === "confirmed" ? <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
                : b.status === "requested" || b.status === "pending_payment" ? <Hourglass className="mx-auto h-10 w-10 text-muted-foreground" />
                : <CalendarX className="mx-auto h-10 w-10 text-destructive" />}
              <h1 className="text-xl font-bold">
                {b.status === "confirmed" ? t("booking.done.confirmed") : b.status === "requested" ? t("booking.done.requested")
                  : b.status === "pending_payment" ? t("booking.done.pending") : t("booking.done.cancelled")}
              </h1>
              {b.title && <p className="font-medium">{b.title}</p>}
              {b.startUtc ? (
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(new Date(b.startUtc))} ({tz})
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("booking.done.masked")}</p>
              )}
              {b.locationValue && <p className="break-all text-sm">{b.locationValue}</p>}
              {b.status === "requested" && <p className="text-sm text-muted-foreground">{t("booking.done.requestedBody")}</p>}
              {b.status === "pending_payment" && paid && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
              {b.status === "confirmed" && !b.masked && token && (
                <Button asChild>
                  <a href={`/api/public/booking-ics/${b.id}?token=${encodeURIComponent(token)}`} download><Download className="h-4 w-4" />{t("booking.done.ics")}</a>
                </Button>
              )}
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
