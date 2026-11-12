/**
 * ROUT Card database access: freeze (db/0198), CMF designs, single-use secure
 * QR nonces, physical keys and challenges (db/0199). Until a migration is
 * applied by the database owner, reads degrade (`available: false`) and
 * writes throw a 503-style error. Authentication always fails closed.
 */
import { sql } from "@/lib/neon";

export function missingSchema(err: unknown): boolean {
  const s = String((err as { message?: string })?.message ?? err);
  const code = (err as { code?: string })?.code;
  return code === "42P01" || code === "42883" || /42P01|42883|card_freezes|card_designs|card_token_uses|physical_keys|hardware_challenges|rout_card_|rout_hw_|rout_pair_factory_card/.test(s);
}

function notReady(): Error {
  return Object.assign(new Error("Card storage is not set up yet"), { statusCode: 503 });
}

export async function cardFrozen(serial: string): Promise<{ frozen: boolean; available: boolean }> {
  try {
    const rows = await sql.query("select public.rout_card_frozen($1) as f", [serial]);
    return { frozen: rows[0]?.f === true, available: true };
  } catch (err) {
    if (missingSchema(err)) return { frozen: true, available: false };
    throw err;
  }
}

/** Card frozen, or any physical key linked to it frozen/revoked. */
export async function cardStatus(serial: string): Promise<"active" | "frozen" | "blocked" | "unavailable"> {
  try {
    const rows = await sql.query("select public.rout_card_status_by_serial($1) as s", [serial]);
    const s = rows[0]?.s;
    return s === "active" || s === "frozen" || s === "blocked" ? s : "unavailable";
  } catch (err) {
    return "unavailable";
  }
}

/** Universal positive-active gate; absent/unknown storage is never active. */
export async function validateCardActive(serial: string): Promise<boolean> {
  return (await cardStatus(serial)) === "active";
}

/**
 * Freezes or thaws the card serial plus any extra serials (the wallet key).
 * Ownership is checked in SQL as well as by RLS; a blocked serial never thaws.
 */
export async function setCardFrozen(serial: string, userId: string, frozen: boolean, extra: string[] = []): Promise<void> {
  const serials = [serial, ...extra];
  try {
    if (frozen) {
      await sql.query(
        "insert into public.card_freezes (serial, user_id) select s, $2::uuid from unnest($1::text[]) as s on conflict (serial) do nothing",
        [serials, userId],
      );
    } else {
      await sql.query("delete from public.card_freezes where serial = any($1::text[]) and user_id = $2::uuid and not blocked", [serials, userId]);
    }
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    throw err;
  }
  // Linked physical keys follow the card (revoked keys stay revoked).
  try {
    await sql.query(
      frozen
        ? "update public.physical_keys set status = 'frozen' where card_serial = $1 and user_id = $2::uuid and status = 'active'"
        : "update public.physical_keys set status = 'active' where card_serial = $1 and user_id = $2::uuid and status = 'frozen' and public_key is not null",
      [serial, userId],
    );
  } catch (err) {
    if (!missingSchema(err)) throw err;
  }
}

/** Permanent block: these serials never verify again. Linked physical keys are revoked. */
export async function blockCard(serial: string, userId: string, reason: "lost" | "stolen" | "replaced" | "other", extra: string[] = []): Promise<void> {
  const serials = [serial, ...extra];
  try {
    await sql.query(
      `insert into public.card_freezes (serial, user_id, blocked, reason) select s, $2::uuid, true, $3 from unnest($1::text[]) as s
       on conflict (serial) do update set blocked = true, reason = excluded.reason where card_freezes.user_id = excluded.user_id`,
      [serials, userId, reason],
    );
    await sql.query("update public.physical_keys set status = 'revoked' where card_serial = $1 and user_id = $2::uuid and status <> 'revoked'", [serial, userId]);
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    throw err;
  }
}

/**
 * Replacement in one database transaction: block the old card and its wallet key,
 * revoke its physical keys and move to the next generation, all or nothing.
 * The generation only moves from the one the caller saw, so two concurrent
 * replacements can never skip a number. Returns the new generation, or null when
 * another replacement won the race.
 */
export async function replaceCardAtomically(serial: string, userId: string, fromGeneration: number, extra: string[] = []): Promise<number | null> {
  const serials = [serial, ...extra];
  try {
    const results = await sql.transaction([
      sql`insert into public.card_freezes (serial, user_id, blocked, reason) select s, ${userId}::uuid, true, 'replaced' from unnest(${serials}::text[]) as s
          on conflict (serial) do update set blocked = true, reason = excluded.reason where card_freezes.user_id = excluded.user_id`,
      sql`update public.physical_keys set status = 'revoked' where card_serial = ${serial} and user_id = ${userId}::uuid and status <> 'revoked'`,
      sql`insert into public.rout_card_generations (user_id, generation) values (${userId}::uuid, 1)
          on conflict (user_id) do update set generation = rout_card_generations.generation + 1, replaced_at = now()
          where rout_card_generations.generation = ${fromGeneration}
          returning generation`,
    ]);
    const g = Number((results[2] as { generation?: unknown }[] | undefined)?.[0]?.generation);
    return Number.isInteger(g) && g > fromGeneration ? g : null;
  } catch (err) {
    if (missingSchema(err) || /rout_card_generations/.test(String((err as Error)?.message))) throw notReady();
    throw err;
  }
}

/** Current card generation (0 = original numbers); only a missing table counts as 0, other errors fail closed. */
export async function cardGeneration(userId: string): Promise<number> {
  try {
    const rows = await sql.query("select public.rout_card_generation($1::uuid) as g", [userId]);
    const g = Number(rows[0]?.g ?? 0);
    if (!Number.isInteger(g) || g < 0) throw new Error("invalid card generation");
    return g;
  } catch (err) {
    // Only a database without the generation table means "never replaced"; any other
    // failure must not silently fall back to the original (blocked) card numbers.
    if (missingSchema(err)) return 0;
    throw err;
  }
}

export async function readCardDesign(serial: string): Promise<Record<string, unknown> | null> {
  try {
    const rows = await sql.query("select public.rout_card_design($1) as d", [serial]);
    const d = rows[0]?.d;
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
  } catch (err) {
    if (missingSchema(err)) return null;
    throw err;
  }
}

export async function saveCardDesign(serial: string, userId: string, cmf: unknown): Promise<void> {
  try {
    await sql.query(
      `insert into public.card_designs (serial, user_id, cmf, updated_at) values ($1, $2::uuid, $3::jsonb, now())
       on conflict (serial) do update set cmf = excluded.cmf, updated_at = now() where card_designs.user_id = excluded.user_id`,
      [serial, userId, JSON.stringify(cmf)],
    );
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    throw err;
  }
}

/** Records a secure-QR nonce. true = first use; false = replay; null = table missing. */
export async function useTokenNonce(nonce: string, expMs: number): Promise<boolean | null> {
  try {
    const rows = await sql.query("select public.rout_card_token_use($1, $2::timestamptz) as ok", [nonce, new Date(expMs).toISOString()]);
    return rows[0]?.ok === true;
  } catch (err) {
    if (missingSchema(err)) return null;
    throw err;
  }
}

export type PhysicalKey = {
  hardware_id: string;
  label: string | null;
  nfc_uid: string | null;
  status: "pending" | "active" | "frozen" | "revoked";
  key_alg: string | null;
  has_key: boolean;
  issued_at: string;
  last_scanned_at: string | null;
};

export async function listMyKeys(): Promise<{ keys: PhysicalKey[]; available: boolean }> {
  try {
    const rows = await sql.query(
      `select hardware_id, label, nfc_uid, status, key_alg, public_key is not null as has_key, issued_at, last_scanned_at
         from public.physical_keys where user_id = public.rout_current_user_id() order by issued_at desc limit 20`,
    );
    return { keys: rows as PhysicalKey[], available: true };
  } catch (err) {
    if (missingSchema(err)) return { keys: [], available: false };
    throw err;
  }
}

export async function addMyKey(userId: string, k: { serial: string; label: string | null; nfcUid: string | null; publicKey: string | null; keyAlg: string | null }): Promise<string> {
  try {
    const rows = await sql.query(
      `insert into public.physical_keys (user_id, card_serial, label, nfc_uid, public_key, key_alg)
       values ($1::uuid, $2, $3, $4, $5, $6) returning hardware_id`,
      [userId, k.serial, k.label, k.nfcUid, k.publicKey, k.keyAlg],
    );
    return String(rows[0]?.hardware_id);
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    if (/23505/.test(String((err as Error)?.message))) throw Object.assign(new Error("This chip is already linked"), { statusCode: 409 });
    throw err;
  }
}

/** Atomic factory inventory claim; public NDEF ID alone never authorizes it. */
export async function pairFactoryKey(hardwareId: string, activationHash: string, serial: string): Promise<string | null> {
  try {
    const rows = await sql.query("select public.rout_pair_factory_card($1::uuid, $2, $3) as id", [hardwareId, activationHash, serial]);
    return typeof rows[0]?.id === "string" ? rows[0].id : null;
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    throw err;
  }
}

export async function setMyKeyStatus(hardwareId: string, status: "active" | "frozen" | "revoked"): Promise<boolean> {
  try {
    const rows = await sql.query(
      `update public.physical_keys set status = $2
        where hardware_id = $1::uuid and user_id = public.rout_current_user_id()
          and status <> 'revoked' and ($2 <> 'active' or public_key is not null)
        returning hardware_id`,
      [hardwareId, status],
    );
    return rows.length > 0;
  } catch (err) {
    if (missingSchema(err)) throw notReady();
    throw err;
  }
}

export async function issueChallenge(hardwareId: string, nonceHash: string): Promise<boolean | null> {
  try {
    if (!(await hardwareActive(hardwareId))) return false;
    const rows = await sql.query("select public.rout_hw_issue_challenge($1::uuid, $2) as ok", [hardwareId, nonceHash]);
    return rows[0]?.ok === true;
  } catch (err) {
    if (missingSchema(err)) return null;
    throw err;
  }
}

export async function consumeChallenge(hardwareId: string, nonceHash: string): Promise<{ public_key: string; key_alg: string; status: string } | null> {
  if (!(await hardwareActive(hardwareId))) return null;
  const rows = await sql.query("select * from public.rout_hw_consume_challenge($1::uuid, $2)", [hardwareId, nonceHash]);
  const r = rows[0];
  return r && r.public_key && r.status === "active" ? (r as { public_key: string; key_alg: string; status: string }) : null;
}

async function hardwareActive(hardwareId: string): Promise<boolean> {
  try {
    const rows = await sql.query("select public.rout_card_status_by_hardware($1::uuid) as s", [hardwareId]);
    return rows[0]?.s === "active";
  } catch { return false; }
}

export async function recordScan(hardwareId: string, ok: boolean): Promise<void> {
  await sql.query("select public.rout_hw_record_scan($1::uuid, $2)", [hardwareId, ok]).catch(() => undefined);
}
