/**
 * Adminwachtrij voor fysieke cadeaubonnen (gratis levering in België).
 * Digitale bonnen komen hier nooit in: die vertrekken meteen per e-mail.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

export const FULFILMENT_STEPS = ["pending_print", "packaged", "shipped"] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STEPS)[number];

export interface GiftShipmentRow {
  id: string;
  code: string;
  amount_cents: number;
  design: string;
  status: string;
  fulfilment_status: string;
  tracking_code: string | null;
  purchaser_email: string;
  recipient_name: string | null;
  ship_name: string | null;
  ship_line1: string | null;
  ship_postal_code: string | null;
  ship_city: string | null;
  ship_country: string | null;
  created_at: string;
  shipped_at: string | null;
}

/** Alle fysieke bonnen; `openOnly` verbergt wat al verzonden is. */
export async function fetchGiftShipments(openOnly: boolean): Promise<GiftShipmentRow[]> {
  try {
    const rows = (await sql`
      select id, code, amount_cents, design, status, fulfilment_status, tracking_code,
             purchaser_email, recipient_name, ship_name, ship_line1, ship_postal_code,
             ship_city, ship_country, created_at, shipped_at
        from public.gift_cards
       where physical_delivery = true
         and status in ('paid', 'delivered')
         and ${openOnly ? sql`fulfilment_status <> 'shipped'` : sql`true`}
       order by created_at asc
       limit 200
    `) as Row[];
    return rows as unknown as GiftShipmentRow[];
  } catch (error) {
    console.error("[admin] cadeaubon-wachtrij kon niet worden gelezen", error);
    throw new Error("gift_shipments_unavailable");
  }
}

/** Zet één zending een stap verder; trackingcode is optioneel. */
export async function updateGiftShipment(opts: {
  giftId: string;
  status: FulfilmentStatus;
  trackingCode?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const tracking = (opts.trackingCode ?? "").trim().slice(0, 64) || null;
  const rows = (await sql`
    update public.gift_cards
       set fulfilment_status = ${opts.status},
           tracking_code = coalesce(${tracking}, tracking_code),
           packaged_at = case when ${opts.status} = 'packaged' then now() else packaged_at end,
           shipped_at = case when ${opts.status} = 'shipped' then now() else shipped_at end,
           updated_at = now()
     where id = ${opts.giftId}
       and physical_delivery = true
    returning code
  `) as Row[];
  const row = rows[0];
  if (!row) return { ok: false, message: "Zending niet gevonden." };
  return { ok: true, message: `${String(row["code"])} staat nu op ${opts.status}.` };
}
