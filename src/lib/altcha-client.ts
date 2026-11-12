/**
 * Browser side of the self-hosted ALTCHA bot check.
 * A proof is solved in the background as soon as a protected form is shown,
 * then taken (once) at submit. Each proof is single-use on the server, so a
 * new one is prepared right after taking.
 */
import { getAltchaChallenge } from "@/lib/altcha.functions";
import { enclave } from "@/lib/crypto-enclave/client";

type Challenge = { algorithm: string; challenge: string; salt: string; signature: string; maxnumber: number; hard: boolean };

const THROTTLE_SALT = "rout:signin-guard:v1";
let cached: { proof: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

async function sha256Hex(value: string) {
  return enclave.hash.sha256Hex(value);
}

function solveInWorker(ch: Challenge): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./altcha.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("altcha_worker_timeout"));
    }, 120_000);
    worker.onmessage = (e: MessageEvent<{ number: number | null }>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data.number);
    };
    worker.onerror = worker.onmessageerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("altcha_worker_unavailable"));
    };
    try {
      worker.postMessage({ challenge: ch.challenge, salt: ch.salt, maxnumber: ch.maxnumber });
    } catch {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("altcha_worker_unavailable"));
    }
  });
}

async function solve(ch: Challenge): Promise<string> {
  const started = Date.now();
  const number = await solveInWorker(ch);
  if (number === null) throw new Error("altcha_unsolved");
  const { hard: _hard, maxnumber: _max, ...rest } = ch;
  return btoa(JSON.stringify({ ...rest, number, took: Date.now() - started }));
}

function expiryOf(ch: Challenge) {
  const expires = Number(new URLSearchParams(ch.salt.split("?")[1] ?? "").get("expires"));
  return expires * 1000 - 30_000; // keep a safety margin
}

/** Starts solving a default proof in the background (no-op if one is ready). */
export function prefetchProof(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.proof);
  if (pending) return pending;
  pending = (async () => {
    const ch = (await getAltchaChallenge({ data: {} })) as Challenge;
    const proof = await solve(ch);
    cached = { proof, expiresAt: expiryOf(ch) };
    return proof;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Returns a single-use proof for the next request. With an e-mail address the
 * server may demand a harder proof (after repeated failed sign-ins).
 */
export async function takeProof(email?: string): Promise<string> {
  let proof: string;
  if (email) {
    const identityHash = await sha256Hex(`${THROTTLE_SALT}|${email.trim().toLowerCase()}`);
    const ch = (await getAltchaChallenge({ data: { identityHash } })) as Challenge;
    proof = ch.hard ? await solve(ch) : await prefetchProof().catch(() => solve(ch));
  } else {
    proof = await prefetchProof();
  }
  if (cached?.proof === proof) cached = null;
  void prefetchProof().catch(() => null);
  return proof;
}

/** Always solves a brand-new challenge (no cache) — used for one retry after a rejected proof. */
export async function freshProof(email?: string): Promise<string> {
  cached = null;
  const identityHash = email ? await sha256Hex(`${THROTTLE_SALT}|${email.trim().toLowerCase()}`) : undefined;
  const ch = (await getAltchaChallenge({ data: identityHash ? { identityHash } : {} })) as Challenge;
  return solve(ch);
}

/** True when an auth response was rejected by the bot check. */
export function isAltchaRejection(result: unknown): boolean {
  const code = (result as { error?: { code?: string } } | undefined)?.error?.code;
  return typeof code === "string" && code.toLowerCase() === "altcha_invalid";
}

/** Runs an auth call with a proof; retries once with a freshly solved proof if the bot check rejects it. */
export async function withAltcha<T>(email: string | undefined, run: (proof: string) => Promise<T>): Promise<T> {
  const first = await run(await takeProof(email));
  if (!isAltchaRejection(first)) return first;
  return run(await freshProof(email));
}
