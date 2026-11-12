import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHandle } from "@/lib/claim.functions";
import { SocialVerifyPanel } from "@/components/dashboard/SocialVerifyPanel";

/**
 * Identiteit: bewijs dat je Mastodon-, Bluesky-, GitHub-… account van jou is
 * door je rout.be-link in je bio te zetten (Mastodon: rel="me"-veld).
 */
export function SocialIdentityVerify() {
  const fetchHandle = useServerFn(getMyHandle);
  const { data } = useQuery({ queryKey: ["my-handle"], queryFn: () => fetchHandle() });
  return <SocialVerifyPanel handle={data?.handle ?? ""} />;
}
