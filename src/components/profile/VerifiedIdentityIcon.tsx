import { VERIFIED_MARK } from "@/lib/verified-mark";
import { cn } from "@/lib/utils";

export function VerifiedIdentityIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("text-identity-verified", className)} aria-hidden="true">
    <path d={VERIFIED_MARK.outline} /><path d={VERIFIED_MARK.check} />
  </svg>;
}