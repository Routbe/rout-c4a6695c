import { useCallback, useEffect, useState } from "react";

/**
 * Dual identity (Pro): één account, twee publieke ruimtes.
 *
 *   verified → rout.be/[handle]     (blauw vinkje)
 *   alias    → rout.be/u/[alias]    (privacy shield)
 *
 * De keuze bepaalt welke context Studio bewerkt en wordt lokaal bewaard zodat
 * ze een refresh overleeft. Free-accounts zitten altijd op `alias`.
 */
export type IdentitySpace = "verified" | "alias";

const KEY = "rout_identity_space";
const EVENT = "rout:identity-space";

function read(): IdentitySpace {
  if (typeof window === "undefined") return "alias";
  try {
    return localStorage.getItem(KEY) === "verified" ? "verified" : "alias";
  } catch {
    return "alias";
  }
}

export function useIdentitySpace(canUseVerified = false) {
  const [space, setSpace] = useState<IdentitySpace>("alias");

  useEffect(() => {
    setSpace(read());
    const sync = () => setSpace(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((next: IdentitySpace) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage may be unavailable (private mode); state still updates.
    }
    window.dispatchEvent(new Event(EVENT));
    setSpace(next);
  }, []);

  // Zonder Pro bestaat de geverifieerde ruimte niet: altijd terugvallen op alias.
  const active: IdentitySpace = canUseVerified ? space : "alias";
  return { space: active, select };
}
