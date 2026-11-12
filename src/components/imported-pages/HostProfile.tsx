import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ProfileLookupError, ProfileMissing, ProfileView } from "@/components/profile/ProfileView";
import { ProfileSuspended } from "@/components/profile/ProfileSuspended";
import { useProfileRecord } from "@/hooks/useProfileRecord";

/**
 * Profiel dat op een eigen (geverifieerd) domein wordt geserveerd, bv.
 * links.jouwmerk.com. Dezelfde weergave als /@handle, zonder ROUT-chrome.
 */
export function HostProfile({ handle }: { handle: string }) {
  const { profile, suspended, loading, error, retry } = useProfileRecord(handle);

  useEffect(() => {
    if (profile) document.title = profile.display_name || `@${profile.username}`;
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) return <ProfileLookupError username={handle} onRetry={retry} />;
  if (!profile) return <ProfileMissing username={handle} />;
  if (suspended || profile.status === "suspended" || profile.status === "banned") {
    return <ProfileSuspended username={handle} />;
  }

  return <ProfileView profile={profile} free={!profile.verified} />;
}

export default HostProfile;
