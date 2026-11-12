import { BadgeCheck, ShieldCheck } from "lucide-react";

/**
 * Dual-identity weergave voor adminkaarten.
 *
 * Regel: een gratis/alias-account leeft op `rout.be/u/<alias>` en krijgt nooit
 * het blauwe vinkje. Een geverifieerd (pro) account leeft op `rout.be/<handle>`
 * en draagt het vinkje wél.
 */
export function UserIdentityLines({
  verified,
  username,
  alias,
}: {
  verified: boolean;
  username: string | null;
  alias: string | null;
}) {
  const handle = (username ?? "").replace(/^@/, "").toLowerCase();
  const aliasHandle = (alias ?? "")
    .replace(/^@?u\//, "")
    .replace(/^@/, "")
    .toLowerCase();

  const isVerified = verified && handle.length > 0;
  const label = isVerified ? `@${handle}` : `@u/${aliasHandle || handle || "—"}`;
  const url = isVerified ? `rout.be/${handle}` : `rout.be/u/${aliasHandle || handle || "…"}`;
  const email = isVerified ? `${handle}@rout.be` : `${aliasHandle || handle || "…"}@u.rout.be`;

  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1 text-xs font-medium text-foreground">
        {label}
        {isVerified ? (
          <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Geverifieerd" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Privé alias" />
        )}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">{url}</p>
      <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        {email}
        {isVerified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Actief
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-600">
            Coming soon
          </span>
        )}
      </p>
    </div>
  );
}
