import { useQuery } from "@tanstack/react-query";
import { getQaPublic } from "@/lib/questions.functions";

export type QaSpace = "root" | "alias";

export const qaPublicKey = (space: QaSpace, handle: string) => ["qa-public", space, handle.toLowerCase()] as const;

/** One shared cache entry per profile: hub block, status ring and /ask page reuse it. */
export function useQaPublic(handle: string | null, space: QaSpace) {
  return useQuery({
    queryKey: qaPublicKey(space, handle ?? ""),
    queryFn: () => getQaPublic({ data: { handle: handle ?? "", space } }).then((r) => r.qa),
    enabled: Boolean(handle),
    staleTime: 60_000,
  });
}

/** Public paths for a profile's Q&A. */
export function qaPaths(handle: string, space: QaSpace) {
  const profile = space === "alias" ? `/u/${handle}` : `/${handle}`;
  return { profile, ask: `${profile}/ask` };
}
