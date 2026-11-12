/**
 * Tweede pagina bij verificatie.
 *
 * Zodra een account betaald én geverifieerd is, hoort het twee publieke
 * adressen te hebben:
 *   • het gratis aliasprofiel   → rout.be/u/<oude naam>
 *   • het geverifieerde profiel → rout.be/voornaam.achternaam
 *
 * Standaard is dat `voornaam.achternaam`. Is die naam bezet, dan schuift het
 * door naar de varianten uit de bestaande naambouwer (jdelplanche,
 * delplanchej, jona.d …). Het lid kan de vorm achteraf altijd zelf wijzigen.
 */

import { sql } from "@/lib/neon";
import {
  DEFAULT_BUILDER_CONFIG,
  buildHandle,
  parseLegalName,
  toStorageHandle,
  type HandleBuilderConfig,
} from "./verified-handle-builder";
import { isReservedSlug } from "./reserved-slugs";

type Row = Record<string, unknown>;

/** Volgorde van voorkeur: eerst voornaam.achternaam, dan kortere varianten. */
const VARIANTS: Partial<HandleBuilderConfig>[] = [
  { fullness: "all-full", separator: "." },
  { fullness: "all-full", separator: "" },
  { fullness: "all-full", separator: "-" },
  { fullness: "first-short", separator: "", surnameShortStyle: "initials" },
  { fullness: "surname-short", separator: "", surnameShortStyle: "initials" },
  { order: "surname-first", fullness: "first-short", separator: "" },
];

export function verifiedHandleCandidates(legalName: string): string[] {
  const parsed = parseLegalName(legalName);
  if (!parsed) return [];
  const out: string[] = [];
  for (const variant of VARIANTS) {
    const handle = toStorageHandle(buildHandle(parsed, { ...DEFAULT_BUILDER_CONFIG, ...variant }));
    if (handle.length >= 5 && !isReservedSlug(handle) && !out.includes(handle)) out.push(handle);
  }
  // Laatste redmiddel: dezelfde naam met een klein volgnummer.
  const base = out[0];
  if (base) for (let i = 2; i <= 9; i += 1) out.push(`${base}${i}`);
  return out;
}

/**
 * Activeert de geverifieerde pagina. Bewaart eerst de gratis naam op `/u/` en
 * hernoemt daarna de roothandle. Doet niets wanneer de huidige roothandle al
 * uit de wettelijke naam is opgebouwd of wanneer er geen naam bekend is.
 */
export async function activateVerifiedRootHandle(
  userId: string,
  legalName: string | null | undefined,
): Promise<{ ok: boolean; handle: string | null; aliasHandle: string | null }> {
  const name = String(legalName ?? "").trim();
  if (!name) return { ok: false, handle: null, aliasHandle: null };

  const rows = (await sql`
    select username from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const current = (rows[0]?.["username"] as string | null) ?? null;

  const candidates = verifiedHandleCandidates(name);
  if (candidates.length === 0) return { ok: false, handle: null, aliasHandle: null };

  // Draagt het lid al een handle uit zijn wettelijke naam? Dan niets wijzigen.
  if (current && candidates.includes(current.toLowerCase())) {
    return { ok: true, handle: current, aliasHandle: null };
  }

  const { isHandleAvailableFor } = await import("./handle-namespace.server");
  let chosen: string | null = null;
  for (const candidate of candidates) {
    if (await isHandleAvailableFor(candidate, userId)) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) return { ok: false, handle: current, aliasHandle: null };

  // De oude (gratis) naam blijft bestaan als /u/-pagina.
  const { preserveFreeAliasHandle, ensureFreeAliasProfile } = await import(
    "./alias-profile.server"
  );
  const preserved = await preserveFreeAliasHandle(userId, current);
  if (!preserved.ok) await ensureFreeAliasProfile(userId, { seed: name });

  try {
    await sql`
      update public.profiles
         set username = ${chosen}, updated_at = now()
       where id = ${userId}
    `;
  } catch (error) {
    console.error("[verified-handle:rename:failed]", error);
    return { ok: false, handle: current, aliasHandle: preserved.handle };
  }

  return { ok: true, handle: chosen, aliasHandle: preserved.handle };
}
