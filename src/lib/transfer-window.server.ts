/**
 * Betaaltermijn van overschrijvingen.
 *
 * Een overschrijving krijgt exact één week (7 dagen) om binnen te komen. Zolang
 * die termijn loopt blijft de scanner de openstaande betaling regelmatig
 * nakijken; pas na het verstrijken van `expires_at` wordt de betaling verlopen
 * verklaard. Zo wordt niemand geannuleerd omdat zijn bank er dagen over doet.
 */
import { sql } from "@/lib/neon";

/** Duur van het betaalvenster voor overschrijvingen. */
export const TRANSFER_WINDOW_DAYS = 7;

const OPEN_STATUSES = ["pending", "awaiting_transfer"];

export interface TransferScanResult {
  scanned: number;
  expired: number;
  stillOpen: number;
}

/**
 * Eén scanronde: markeert elke openstaande overschrijving als nagekeken en zet
 * alleen betalingen waarvan het venster van 7 dagen voorbij is op `expired`.
 */
export async function runTransferWindowScan(): Promise<TransferScanResult> {
  // Vul een ontbrekende einddatum aan (oudere rijen of handmatige inserts).
  await sql`
    update public.verification_payments
       set expires_at = created_at + interval '7 days'
     where expires_at is null
       and status = any(${OPEN_STATUSES})
  `;

  const open = (await sql`
    update public.verification_payments
       set last_scanned_at = now()
     where status = any(${OPEN_STATUSES})
     returning id, expires_at
  `) as { id: string; expires_at: string | null }[];

  const expired = (await sql`
    update public.verification_payments
       set status = 'expired', updated_at = now()
     where status = any(${OPEN_STATUSES})
       and expires_at is not null
       and expires_at < now()
     returning id
  `) as { id: string }[];

  const result = {
    scanned: open.length,
    expired: expired.length,
    stillOpen: open.length - expired.length,
  };
  console.info("[transfer-scan] ronde afgerond", result);
  return result;
}
