import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Check,
  Contact,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquareHeart,
  Music,
  Settings2,
  Share2,
  Smartphone,
  Type as TypeIcon,
  Video,
  Wallet,
  Wifi,
} from "lucide-react";
import { PAYMENT_METHODS, isPaymentType, PaymentId } from "@/lib/payments";
import { useI18n } from "@/lib/i18n";
import { PaymentBrandIcon } from "./PaymentBrandIcon";
import { Button } from "@/components/ui/button";
import { siSteam } from "simple-icons";

export type QRType =
  | "url"
  | "text"
  | "wifi"
  | "email"
  | "sms"
  | "whatsapp"
  | "image"
  | "pdf"
  | "mp3"
  | "app"
  | "vcard"
  | "event"
  | "social"
  | "maps"
  | "meeting"
  | "feedback"
  | "steam"
  | PaymentId;

export interface QRTypeOption {
  id: QRType;
  /** Translation key; falls back to the raw label. */
  labelKey?: string;
  label: string;
  image?: string;
}

/** One uniform line-icon per type — no mixed thumbnails. */
export const typeIcons: Partial<Record<QRType, typeof Link2>> = {
  url: Link2,
  app: Smartphone,
  social: Share2,
  maps: MapPin,
  meeting: Video,
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  vcard: Contact,
  image: ImageIcon,
  pdf: FileText,
  mp3: Music,
  wifi: Wifi,
  text: TypeIcon,
  event: Calendar,
  feedback: MessageSquareHeart,
};

export const descKeyOf = (id: QRType) =>
  isPaymentType(id) ? "type.payment.desc" : `type.${id}.desc`;

/** Non-payment types, in sidebar order. */
export const baseQrTypes: QRTypeOption[] = [
  { id: "url", label: "URL", labelKey: "type.url" },
  { id: "text", label: "Text", labelKey: "type.text" },
  { id: "wifi", label: "Wi-Fi", labelKey: "type.wifi" },
  { id: "email", label: "E-mail", labelKey: "type.email" },
  { id: "sms", label: "SMS", labelKey: "type.sms" },
  { id: "whatsapp", label: "WhatsApp", labelKey: "type.whatsapp" },
  { id: "image", label: "Image", labelKey: "type.image" },
  { id: "pdf", label: "PDF", labelKey: "type.pdf" },
  { id: "mp3", label: "MP3", labelKey: "type.mp3" },
  { id: "app", label: "App", labelKey: "type.app" },
  { id: "vcard", label: "Contact card", labelKey: "type.vcard" },
  { id: "event", label: "Event", labelKey: "type.event" },
  { id: "social", label: "Social profile hub", labelKey: "type.social" },
  { id: "maps", label: "Map location", labelKey: "type.maps" },
  { id: "meeting", label: "Meeting link", labelKey: "type.meeting" },
  { id: "feedback", label: "Feedback & Reviews", labelKey: "type.feedback" },
  { id: "steam", label: "Steam profile", labelKey: "type.steam" },
];

const byId = (id: QRType) => {
  const option = baseQrTypes.find((t) => t.id === id);
  if (!option) throw new Error(`Unknown curated QR type: ${id}`);
  return option;
};

export const PRIMARY_PAYMENT_IDS = ["iban", "wero", "paypal", "crypto"] as const;
export const internationalPaymentTypes: QRTypeOption[] = PAYMENT_METHODS
  .filter(m => !PRIMARY_PAYMENT_IDS.some(id => id === m.id))
  .map(m => ({ id: m.id, label: m.label }));
export function InternationalPaymentOptions({ selectedType, onSelect }: { selectedType: QRType; onSelect: (id: QRType) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="col-span-full"><Button type="button" variant="ghost" className="mt-2 h-auto whitespace-normal text-left text-xs" aria-expanded={open} onClick={() => setOpen(!open)}>Bekijk {open ? "minder" : "meer"} internationale opties</Button>{open && <div className="mt-2 space-y-1">{internationalPaymentTypes.map(type => <QRTypeRow key={type.id} type={type} selected={type.id === selectedType} onSelect={onSelect} />)}</div>}</div>;
}

export interface QRTypeCategory {
  id: string;
  labelKey: string;
  label: string;
  Icon: typeof Link2;
  types: QRTypeOption[];
}

/** Tier 1 — only these are visible until one is opened. */
export const qrTypeCategories: QRTypeCategory[] = [
  {
    id: "link",
    labelKey: "cat.link",
    label: "Link & Web",
    Icon: Link2,
    types: [byId("url"), byId("app"), byId("social"), byId("steam")],
  },
  {
    id: "payment",
    labelKey: "cat.payment",
    label: "Payment",
    Icon: Wallet,
    types: PAYMENT_METHODS.map(m => ({ id: m.id, label: m.label })),
  },
  {
    id: "contact",
    labelKey: "cat.contact",
    label: "Contact & Messaging",
    Icon: MessageSquare,
    types: [byId("email"), byId("sms"), byId("whatsapp"), byId("vcard"), byId("meeting"), byId("feedback")],
  },
  {
    id: "file",
    labelKey: "cat.file",
    label: "File & Media",
    Icon: FolderOpen,
    types: [byId("image"), byId("pdf"), byId("mp3")],
  },
  {
    id: "utility",
    labelKey: "cat.utility",
    label: "Utility",
    Icon: Settings2,
    types: [byId("wifi"), byId("text"), byId("event"), byId("maps")],
  },
];

/** Flat lookup across every tier. */
export const allQrTypes: QRTypeOption[] = qrTypeCategories.flatMap((c) => c.types);

export const categoryOf = (type: QRType) =>
  qrTypeCategories.find((c) => c.types.some((t) => t.id === type) || (c.id === "payment" && isPaymentType(type))) ?? qrTypeCategories[0];

/** Uniform icon tile — brand logo for payments, line icon everywhere else. */
export function QRTypeIcon({ id, fallback }: { id: QRType; fallback?: typeof Link2 }) {
  if (isPaymentType(id)) {
    return (
      <PaymentBrandIcon id={id} className="w-10 h-10" />
    );
  }
  if (id === "steam") return <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0"><svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-foreground" role="img" aria-label="Steam"><path d={siSteam.path} /></svg></span>;
  const Icon = typeIcons[id] ?? fallback ?? Link2;
  return (
    <span className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
      <Icon className="w-[18px] h-[18px] text-foreground" strokeWidth={1.7} />
    </span>
  );
}

/** Single selectable row, shared by the sidebar and the mobile bottom sheet. */
export function QRTypeRow({
  type,
  selected,
  onSelect,
  fallbackIcon,
}: {
  type: QRTypeOption;
  selected: boolean;
  onSelect: (id: QRType) => void;
  fallbackIcon?: typeof Link2;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onSelect(type.id)}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-200",
        selected
          ? "border-primary/40 bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
          : "border-transparent hover:bg-muted/60",
      )}
    >
      <QRTypeIcon id={type.id} fallback={fallbackIcon} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground text-sm truncate md:whitespace-normal md:overflow-visible">
          {type.labelKey ? t(type.labelKey) : type.label}
        </span>
        <span className="block text-[11px] leading-snug text-muted-foreground line-clamp-2 md:line-clamp-none">
          {t(descKeyOf(type.id))}
        </span>
      </span>
      {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
    </button>
  );
}

/** Case-insensitive match on the translated label. */
export function useTypeSearch(query: string) {
  const { t } = useI18n();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allQrTypes.filter((ty) => {
      const label = (ty.labelKey ? t(ty.labelKey) : ty.label).toLowerCase();
      return (
        label.includes(q) ||
        ty.id.toLowerCase().includes(q) ||
        t(descKeyOf(ty.id)).toLowerCase().includes(q)
      );
    });
  }, [query, t]);
}

interface QRTypeSelectorProps {
  selectedType: QRType;
  onTypeChange: (type: QRType) => void;
}

export function QRTypeSelector({ selectedType, onTypeChange }: QRTypeSelectorProps) {
  const { t } = useI18n();
  const [openCategory, setOpenCategory] = useState<string>(() => categoryOf(selectedType).id);

  // Follow the active tab when the type changes elsewhere (mobile picker).
  const prevType = useRef(selectedType);
  useEffect(() => {
    if (prevType.current !== selectedType) {
      prevType.current = selectedType;
      setOpenCategory(categoryOf(selectedType).id);
    }
  }, [selectedType]);

  const active = qrTypeCategories.find((c) => c.id === openCategory) ?? qrTypeCategories[0];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[26px] leading-none text-foreground">
          {t("type.heading")}
        </h2>
        <span className="eyebrow">{t("type.eyebrow")}</span>
      </div>

      {/* Mobile: peeking snap carousel. Desktop: everything wraps into view. */}
      <div className="-mx-1 mb-3 w-[calc(100%+0.5rem)] max-w-[calc(100%+0.5rem)] min-w-0 snap-x snap-mandatory overflow-x-auto edge-fade-x overscroll-x-contain scroll-px-1 [scrollbar-width:none] md:overflow-x-visible [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full items-center gap-1.5 px-1 pb-1 md:w-full md:flex-wrap">
          {qrTypeCategories.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setOpenCategory(id)}
              aria-pressed={id === active.id}
              className={cn(
                "flex shrink-0 snap-start items-center gap-1.5 px-3 h-9 rounded-full border text-xs font-medium whitespace-nowrap transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                id === active.id
                  ? "border-foreground bg-foreground font-semibold text-background"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.7} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 md:grid md:grid-cols-2 lg:grid-cols-1">
        {active.types.map((type) => (
          <QRTypeRow
            key={type.id}
            type={type}
            selected={selectedType === type.id}
            onSelect={onTypeChange}
            fallbackIcon={active.Icon}
          />
        ))}
      </div>
    </div>
  );
}
