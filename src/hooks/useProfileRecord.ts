import { useCallback, useEffect, useState } from "react";
import { getPublicProfileByHandle } from "@/lib/studio-profile.functions";
import { getPublicAliasProfileByHandle } from "@/lib/alias-profile.functions";
import type { ProfileBlock, ProfileRecord } from "@/lib/profile";
import { findDemoProfile } from "@/lib/demo-profiles";

type Row = Record<string, unknown> & { blocks?: unknown };

/** Never let a slow edge hop hang the profile page forever. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      console.error(`[profile:lookup:timeout] ${label} exceeded ${ms}ms`);
      reject(new Error(`Profile lookup timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        console.info(`[profile:lookup:success] ${label} in ${Date.now() - startedAt}ms`);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        console.error(`[profile:lookup:failed] ${label}`, err);
        reject(err);
      },
    );
  });
}

/**
 * Loads a public profile by handle from our Neon Postgres database.
 *
 * `profile === null` means the handle is genuinely unclaimed; `error` is only
 * set when the lookup itself failed, so the page never shows a false
 * "still available" state — and never spins forever.
 */
export function useProfileRecord(username: string, options?: { free?: boolean }) {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const free = options?.free;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const handle = username.toLowerCase();
    // Ingebouwde voorbeeldprofielen (landingspagina-vitrine) bestaan altijd.
    const demo = findDemoProfile(handle, free);

    (async () => {
      setLoading(true);
      setError(null);

      let row: Row | null = null;
      try {
        // Strikt gescheiden naamruimtes: /u/<handle> leest uitsluitend het
        // aliasprofiel, de rootnamespace uitsluitend het geverifieerde profiel.
        // Geen fallback — anders zou /u/<naam> het profiel van een ánder
        // account kunnen tonen.
        row = (await withTimeout(
          free
            ? getPublicAliasProfileByHandle({ data: { handle } })
            : getPublicProfileByHandle({ data: { handle } }),
          8000,
          `neon_public_profile:${handle}`,
        )) as Row | null;
      } catch (err) {
        if (cancelled) return;
        console.error("[profile:lookup]", handle, err);
        setSuspended(false);
        if (demo) {
          setProfile(demo.record);
          setError(null);
        } else {
          setProfile(null);
          setError(err instanceof Error ? err.message : "Profile lookup is unavailable");
        }
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setSuspended(Boolean(row?.["is_suspended"]));
      setProfile(
        row
          ? ({
              ...row,
              blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as ProfileBlock[]) : [],
            } as unknown as ProfileRecord)
          : (demo?.record ?? null),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [username, attempt, free]);

  return { profile, suspended, loading, error, retry };
}
