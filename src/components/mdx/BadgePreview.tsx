import { BadgeCheck } from "lucide-react";
import { HumanLinkedIcon } from "@/components/profile/HumanLinkedIcon";
import { CreatorBadgeIcon } from "@/components/profile/CreatorBadgeIcon";
import { DomainBadgeIcon } from "@/components/profile/DomainBadgeIcon";
const labels = { human: "Gekoppeld aan een geverifieerde mens", verified: "Geverifieerde publieke identiteit", creator: "Creator / influencer", business: "Geverifieerd bedrijf" };
export function BadgePreview({ type = "verified" }: { type?: keyof typeof labels }) {
  return <span className={`docs-badge docs-badge-${type} not-prose my-3 inline-flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm`}><span className="size-7 shrink-0">{type === "human" ? <HumanLinkedIcon className="size-7" /> : type === "creator" ? <CreatorBadgeIcon className="size-7" /> : type === "business" ? <DomainBadgeIcon className="size-7" /> : <BadgeCheck className="size-7" aria-hidden />}</span><span className="text-foreground">{labels[type]}</span></span>;
}