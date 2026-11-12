import { useState, type ComponentType, type SVGProps } from "react";
import {
  Calendar,
  CalendarCheck,
  Coffee,
  CreditCard,
  Github,
  Gitlab,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  Phone,
  Send,
  ShoppingBag,
  Twitch,
  Twitter,
  Wallet,
  Wifi,
  Youtube,
} from "lucide-react";
import { BlueskyIcon, MastodonIcon } from "@/components/SocialIcons";
import { cn } from "@/lib/utils";
import { lookupBrandIcon } from "@/utils/brandIcons";

export type PlatformIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

/**
 * Brand marks lucide does not ship. Components are cached per path so the same
 * platform always yields the exact same component identity — React then patches
 * the existing node instead of unmounting and remounting the icon on rerender.
 */
/**
 * Brand marks lucide does not ship. Components are cached per path so the same
 * platform always yields the exact same component identity — React patches the
 * existing node instead of remounting the icon on every rerender.
 */
const MARK_CACHE = new Map<string, PlatformIcon>();

function svg(path: string, viewBox = "0 0 24 24"): PlatformIcon {
  const cacheKey = `${viewBox}|${path}`;
  const cached = MARK_CACHE.get(cacheKey);
  if (cached) return cached;
  function BrandMark(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox={viewBox} fill="currentColor" aria-hidden {...props}>
        <path d={path} />
      </svg>
    );
  }
  MARK_CACHE.set(cacheKey, BrandMark);
  return BrandMark;
}

/** Official peertube mark (simple-icons 16.28.0). */
const PeertubeMark = svg(
  "M12 6.545v10.91L20.727 12M3.273 12v12L12 17.455M3.273 0v12L12 6.545",
);
/** Official vimeo mark (simple-icons 16.28.0). */
const VimeoMark = svg(
  "M23.9765 6.4168c-.105 2.338-1.739 5.5429-4.894 9.6088-3.2679 4.247-6.0258 6.3699-8.2898 6.3699-1.409 0-2.578-1.294-3.553-3.881l-1.9179-7.1138c-.719-2.584-1.488-3.878-2.312-3.878-.179 0-.806.378-1.8809 1.132l-1.129-1.457a315.06 315.06 0 003.501-3.1279c1.579-1.368 2.765-2.085 3.5539-2.159 1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.5069.5389 2.45 1.1309 3.674 1.7759 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.8679 3.434-5.7568 6.7619-5.6368 2.4729.06 3.6279 1.664 3.4929 4.7969z",
);
/** Official dailymotion mark (simple-icons 16.28.0). */
const DailymotionMark = svg(
  "M21.823 7.327a11.928 11.928 0 0 0-2.606-3.814 12.126 12.126 0 0 0-3.866-2.57A12.246 12.246 0 0 0 10.617 0H1.831a.602.602 0 0 0-.609.603v3.764c0 .162.064.312.179.426l4.164 4.123a.612.612 0 0 0 .439.177h4.56c.806 0 1.56.313 2.125.88.557.559.856 1.296.843 2.075-.029 1.571-1.343 2.849-2.931 2.849h-6.74a.613.613 0 0 0-.432.176.619.619 0 0 0-.178.427v3.764c0 .162.063.312.178.427l4.139 4.099a.647.647 0 0 0 .476.21h2.572a12.276 12.276 0 0 0 4.733-.945 12.145 12.145 0 0 0 3.866-2.571 11.959 11.959 0 0 0 2.607-3.813c.633-1.479.956-3.051.956-4.67 0-1.619-.321-3.19-.956-4.669l.001-.005ZM2.441 4.118V1.982l2.945 2.755.001 2.297-2.946-2.916Zm4.975 17.813-2.945-2.917v-2.137l2.945 2.755v2.299Zm-2.004-5.832h5.19c2.248 0 4.107-1.807 4.147-4.03a4.027 4.027 0 0 0-1.192-2.937 4.203 4.203 0 0 0-2.996-1.239H6.606V5.216h3.996c1.831 0 3.553.706 4.849 1.986a6.724 6.724 0 0 1-.152 9.736 6.875 6.875 0 0 1-4.697 1.84H8.275L5.412 16.1v-.001Zm15.289.1a10.753 10.753 0 0 1-2.345 3.431 10.91 10.91 0 0 1-3.48 2.314 11.018 11.018 0 0 1-4.26.847H8.633v-2.814h1.916c2.145 0 4.161-.802 5.675-2.254a7.88 7.88 0 0 0 2.451-5.728c0-2.177-.87-4.21-2.451-5.728-1.514-1.454-3.528-2.254-5.675-2.254h-4.16L3.383 1.202h7.234c1.479 0 2.911.285 4.259.847a10.957 10.957 0 0 1 3.48 2.313 10.769 10.769 0 0 1 2.345 3.432c.571 1.33.86 2.743.86 4.202 0 1.46-.289 2.873-.86 4.203Z",
);
/** Official tumblr mark (simple-icons 16.28.0). */
const TumblrMark = svg(
  "M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z",
);
/** Official lemmy mark (simple-icons 16.28.0). */
const LemmyMark = svg(
  "M2.9595 4.2228a3.9132 3.9132 0 0 0-.332.019c-.8781.1012-1.67.5699-2.155 1.3862-.475.8-.5922 1.6809-.35 2.4971.2421.8162.8297 1.5575 1.6982 2.1449.0053.0035.0106.0076.0163.0114.746.4498 1.492.7431 2.2877.8994-.02.3318-.0272.6689-.006 1.0181.0634 1.0432.4368 2.0006.996 2.8492l-2.0061.8189a.4163.4163 0 0 0-.2276.2239.416.416 0 0 0 .0879.455.415.415 0 0 0 .2941.1231.4156.4156 0 0 0 .1595-.0312l2.2093-.9035c.408.4859.8695.9315 1.3723 1.318.0196.0151.0407.0264.0603.0423l-1.2918 1.7103a.416.416 0 0 0 .664.501l1.314-1.7385c.7185.4548 1.4782.7927 2.2294 1.0242.3833.7209 1.1379 1.1871 2.0202 1.1871.8907 0 1.6442-.501 2.0242-1.2072.744-.2347 1.4959-.5729 2.2073-1.0262l1.332 1.7606a.4157.4157 0 0 0 .7439-.1936.4165.4165 0 0 0-.0799-.3074l-1.3099-1.7345c.0083-.0075.0178-.0113.0261-.0188.4968-.3803.9549-.8175 1.3622-1.2939l2.155.8794a.4156.4156 0 0 0 .5412-.2276.4151.4151 0 0 0-.2273-.5432l-1.9438-.7928c.577-.8538.9697-1.8183 1.0504-2.8693.0268-.3507.0242-.6914.0079-1.0262.7905-.1572 1.5321-.4502 2.2737-.8974.0053-.0033.011-.0076.0163-.0113.8684-.5874 1.456-1.3287 1.6982-2.145.2421-.8161.125-1.697-.3501-2.497-.4849-.8163-1.2768-1.2852-2.155-1.3863a3.2175 3.2175 0 0 0-.332-.0189c-.7852-.0151-1.6231.229-2.4286.6942-.5926.342-1.1252.867-1.5433 1.4387-1.1699-.6703-2.6923-1.0476-4.5635-1.0785a15.5768 15.5768 0 0 0-.5111 0c-2.085.034-3.7537.43-5.0142 1.1449-.0033-.0038-.0045-.0114-.008-.0152-.4233-.5916-.973-1.1365-1.5835-1.489-.8055-.465-1.6434-.7083-2.4286-.6941Zm.2858.7365c.5568.042 1.1696.2358 1.7787.5875.485.28.9757.7554 1.346 1.2696a5.6875 5.6875 0 0 0-.4969.4085c-.9201.8516-1.4615 1.9597-1.668 3.2335-.6809-.1402-1.3183-.3945-1.984-.7948-.7553-.5128-1.2159-1.1225-1.4004-1.7445-.1851-.624-.1074-1.2712.2776-1.9196.3743-.63.9275-.9534 1.6118-1.0322a2.796 2.796 0 0 1 .5352-.0076Zm17.5094 0a2.797 2.797 0 0 1 .5353.0075c.6842.0786 1.2374.4021 1.6117 1.0322.385.6484.4627 1.2957.2776 1.9196-.1845.622-.645 1.2317-1.4004 1.7445-.6578.3955-1.2881.6472-1.9598.7888-.1942-1.2968-.7375-2.4338-1.666-3.302a5.5639 5.5639 0 0 0-.4709-.3923c.3645-.49.8287-.9428 1.2938-1.2113.6091-.3515 1.2219-.5454 1.7787-.5875ZM12.006 6.0036a14.832 14.832 0 0 1 .487 0c2.3901.0393 4.0848.67 5.1631 1.678 1.1501 1.0754 1.6423 2.6006 1.499 4.467-.1311 1.7079-1.2203 3.2281-2.652 4.324-.694.5313-1.4626.9354-2.2254 1.2294.0031-.0453.014-.0888.014-.1349.0029-1.1964-.9313-2.2133-2.2918-2.2133-1.3606 0-2.3222 1.0154-2.2918 2.2213.0013.0507.014.0972.0181.1471-.781-.2933-1.5696-.7013-2.2777-1.2456-1.4239-1.0945-2.4997-2.6129-2.6037-4.322-.1129-1.8567.3778-3.3382 1.5212-4.3965C7.5094 6.7 9.352 6.047 12.006 6.0036Zm-3.6419 6.8291c-.6053 0-1.0966.4903-1.0966 1.0966 0 .6063.4913 1.0986 1.0966 1.0986s1.0966-.4923 1.0966-1.0986c0-.6063-.4913-1.0966-1.0966-1.0966zm7.2819.0113c-.5998 0-1.0866.4859-1.0866 1.0866s.4868 1.0885 1.0866 1.0885c.5997 0 1.0865-.4878 1.0865-1.0885s-.4868-1.0866-1.0865-1.0866zM12 16.0835c1.0237 0 1.5654.638 1.5634 1.4829-.0018.7849-.6723 1.485-1.5634 1.485-.9167 0-1.54-.5629-1.5634-1.493-.0212-.8347.5397-1.4749 1.5634-1.4749Z",
);
/** Official misskey mark (simple-icons 16.28.0). */
const MisskeyMark = svg(
  "M8.91076 16.8915c-1.03957.0038-1.93213-.6294-2.35267-1.366-.22516-.3217-.66989-.4364-.6761 0v2.0148c0 .8094-.29152 1.5097-.87581 2.1002-.56755.573-1.25977.8595-2.0779.8595-.80014 0-1.49298-.2865-2.07727-.8601C.28408 19.05 0 18.3497 0 17.5403V6.45968c0-.62378.17553-1.18863.52599-1.69455.36657-.52284.83426-.88582 1.4018-1.08769a2.84574 2.84574 0 0 1 1.00049-.17742c.90125 0 1.65239.35421 2.25281 1.06262l2.99713 3.51572c.06699.05016.263.43696.73192.43696.47016 0 .6916-.3868.75796-.43758l2.9717-3.5151c.6178-.70841 1.377-1.06262 2.2782-1.06262.3337 0 .6675.05893 1.0012.17742.5669.20187 1.0259.56422 1.377 1.08769.3665.50592.5501 1.07077.5501 1.69455V17.5403c0 .8094-.2915 1.5097-.8758 2.1002-.5675.573-1.2604.8595-2.0779.8595-.8008 0-1.493-.2865-2.0779-.8601-.5669-.5899-.8504-1.2902-.8504-2.0996v-2.0148c-.0496-.5499-.5303-.2032-.7009 0-.4503.8431-1.31369 1.3616-2.35264 1.366ZM21.447 8.60998c-.7009 0-1.3015-.24449-1.8019-.73348-.4838-.50571-.7257-1.11277-.7257-1.82118s.2419-1.30711.7257-1.79611c.5004-.50571 1.101-.75856 1.8019-.75856.7009 0 1.3017.25285 1.8025.75856.5003.489.7505 1.0877.7505 1.79611 0 .70841-.2502 1.31547-.7505 1.82118-.5008.48899-1.1016.73348-1.8025.73348Zm.0248.50655c.7009 0 1.2935.25285 1.7777.75856.5003.50571.7505 1.11301.7505 1.82181v6.2484c0 .7084-.2502 1.3155-.7505 1.8212-.4838.489-1.0764.7335-1.7777.7335-.7005 0-1.3011-.2445-1.8019-.7335-.5003-.5057-.7505-1.1128-.7505-1.8212v-6.2484c0-.7084.2502-1.3157.7505-1.82181.5004-.50571 1.101-.75856 1.8019-.75856Z",
);
const XIcon = svg(
  "M18.9 2.5h3.3l-7.2 8.2 8.5 11.3h-6.7l-5.2-6.9-6 6.9H1.3l7.7-8.8L.9 2.5h6.9l4.7 6.3 6.4-6.3Zm-1.2 17.6h1.8L7.4 4.3H5.4l12.3 15.8Z",
);
const MatrixIcon = svg(
  "M.6 0v24h2v.5H0V-.5h2.6V0H.6Zm5.9 7.4v1.2h.03c.33-.45.72-.8 1.19-1.05a3.2 3.2 0 0 1 1.55-.37c.58 0 1.11.11 1.59.34.48.23.85.63 1.1 1.2.27-.4.64-.76 1.1-1.07a2.9 2.9 0 0 1 1.63-.47c.47 0 .9.06 1.3.17.4.12.74.3 1.02.55.29.25.51.58.67.98.16.4.24.89.24 1.46v5.9h-2.48v-5c0-.3-.01-.58-.03-.84a1.8 1.8 0 0 0-.19-.68 1.1 1.1 0 0 0-.45-.46 1.7 1.7 0 0 0-.82-.17c-.35 0-.63.07-.85.2-.21.14-.38.31-.5.53a2.1 2.1 0 0 0-.25.74c-.04.28-.06.56-.06.84v4.84h-2.48v-4.95c0-.27 0-.53-.02-.8a2.2 2.2 0 0 0-.15-.72 1.1 1.1 0 0 0-.43-.53 1.6 1.6 0 0 0-.88-.2c-.16 0-.37.04-.63.11-.26.08-.51.22-.75.42-.24.2-.45.49-.62.86-.17.37-.25.85-.25 1.45v4.36H4.05V7.4h2.45ZM21.4 24V0h-2v-.5H24v25h-4.6V24h2Z",
);
const TelegramIcon = svg(
  "M23.1 3.6 19.6 20a1.3 1.3 0 0 1-2.1.7l-4.8-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.2c.4-.4-.1-.6-.6-.2L7 12.1 2.3 10.6c-1-.3-1-1 .2-1.5L21.7 2c.9-.3 1.6.2 1.4 1.6Z",
);
const SignalIcon = svg(
  "M12 1.5a10.5 10.5 0 0 0-9.3 15.4L1.5 22.5l5.7-1.2A10.5 10.5 0 1 0 12 1.5Zm0 2a8.5 8.5 0 1 1-4.3 15.8l-.4-.3-3 .7.6-3-.3-.4A8.5 8.5 0 0 1 12 3.5Z",
);
const WhatsappIcon = svg(
  "M12.04 2C6.6 2 2.2 6.4 2.2 11.85c0 1.9.5 3.7 1.45 5.3L2 22l5-1.6a9.8 9.8 0 0 0 5.04 1.38h.01c5.44 0 9.85-4.4 9.85-9.85S17.48 2 12.04 2Zm0 18a8.1 8.1 0 0 1-4.15-1.14l-.3-.18-3.06.98.99-2.98-.2-.31a8.1 8.1 0 1 1 6.72 3.63Zm4.5-5.9c-.24-.13-1.46-.72-1.68-.8-.23-.09-.4-.13-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-2-1.23a7.5 7.5 0 0 1-1.38-1.72c-.15-.25-.02-.38.1-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.05-.31-.02-.43-.06-.13-.55-1.35-.76-1.84-.2-.48-.4-.41-.55-.42h-.48c-.16 0-.43.06-.65.31-.23.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.45-.6 1.66-1.17.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.46-.28Z",
);
// Canoniek eYou-merkpad uit public/img/brand/eyou.svg (113×106 viewBox).
const EyouIcon = svg(
  "M112.4 86.2L85.1 97.4C84.2 86.3 76.3 67.1 69.2 59.7C65.6 76.9 52.1 93.7 40.4 105.9L17.6 83.1C28.1 77 45.2 67.9 52.1 55.5C34.3 57.5 15.9 52.6 0 45.4L13 14.4C25.1 25 39 36.1 56.9 37.8C55 32.3 47.7 21.8 43.4 17.3L60.7 0C64.6 6.2 70.1 26.5 70.4 34.3C78.1 28.5 100.2 18.8 111.1 17.2V44.2C104.6 43.4 84.4 45.2 79 47.1C88.4 52.6 103.7 68.4 109.5 79.8C110.4 81.7 111.5 84.1 112.5 86.3L112.4 86.2Z",
  "0 0 113 106",
);
// Officieel wsocial.eu-logo (lokaal bestand, nooit gehotlinkt) — hetzelfde als bij Live-koppelingen.
function WsocialIcon({ className }: SVGProps<SVGSVGElement> & { className?: string }) {
  return <img src="/icons/wsocial.png" alt="" aria-hidden className={cn(className, "rounded-[22%] object-contain")} />;
}
const DiscordIcon = svg(
  "M20.3 4.4A19 19 0 0 0 15.6 3l-.24.44c1.6.4 2.34.96 3.13 1.66a11.5 11.5 0 0 0-9.5-.34l-.5.34c.84-.74 1.8-1.3 3.13-1.66L11.4 3a19 19 0 0 0-4.7 1.4C3.7 8.8 2.9 13.1 3.3 17.3A19.2 19.2 0 0 0 9 20.2l.9-1.6c-.98-.36-1.9-.82-2.7-1.42l.6-.44a13.6 13.6 0 0 0 11.4 0l.6.44c-.8.6-1.72 1.06-2.7 1.42l.9 1.6a19.2 19.2 0 0 0 5.7-2.9c.5-4.86-.83-9.13-3.4-12.9ZM9.2 14.9c-1.1 0-2-1-2-2.3 0-1.26.88-2.3 2-2.3s2.02 1.04 2 2.3c0 1.27-.88 2.3-2 2.3Zm5.6 0c-1.1 0-2-1-2-2.3 0-1.26.88-2.3 2-2.3s2.02 1.04 2 2.3c0 1.27-.88 2.3-2 2.3Z",
);

/** Hostname → icon. Order matters only for substring fallbacks. */
const HOST_MAP: [RegExp, PlatformIcon][] = [
  [/(^|\.)github\.com$/, Github],
  [/(^|\.)gitlab\.com$/, Gitlab],
  [/(^|\.)instagram\.com$/, Instagram],
  [/(^|\.)linkedin\.com$/, Linkedin],
  [/(^|\.)bsky\.app$/, BlueskyIcon],
  [/(^|\.)(x|twitter)\.com$/, XIcon],
  [/(^|\.)matrix\.to$/, MatrixIcon],
  [/(^|\.)(youtube\.com|youtu\.be)$/, Youtube],
  [/(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/, TelegramIcon],
  [/(^|\.)signal\.(me|org)$/, SignalIcon],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, WhatsappIcon],
  [/(^|\.)discord\.(gg|com)$/, DiscordIcon],
  [/(^|\.)twitch\.tv$/, Twitch],
  [/(^|\.)eyou\.social$/, EyouIcon],
  [/(^|\.)w\.social$|(^|\.)wsocial\./, WsocialIcon],
  [/mastodon|fosstodon|mstdn|social\.|pixelfed/, MastodonIcon],
];

/** Keyword (platform kind or free-text label) → icon. */
const NAME_MAP: Record<string, PlatformIcon> = {
  github: Github,
  gitlab: Gitlab,
  instagram: Instagram,
  linkedin: Linkedin,
  bluesky: BlueskyIcon,
  bsky: BlueskyIcon,
  x: XIcon,
  twitter: XIcon,
  mastodon: MastodonIcon,
  fediverse: MastodonIcon,
  pixelfed: MastodonIcon,
  eyou: EyouIcon,
  "eyou.social": EyouIcon,
  wsocial: WsocialIcon,
  "w.social": WsocialIcon,
  matrix: MatrixIcon,
  element: MatrixIcon,
  youtube: Youtube,
  telegram: TelegramIcon,
  signal: SignalIcon,
  whatsapp: WhatsappIcon,
  whatsapp_chat: WhatsappIcon,
  discord: DiscordIcon,
  twitch: Twitch,
  email: Mail,
  mail: Mail,
  phone: Phone,
  location: MapPin,
  applemaps: MapPin,
  wifi: Wifi,
  shop: ShoppingBag,
  spotify: Music,
  spotify_artist: Music,
  booking_request: CalendarCheck,
  booking: CalendarCheck,
  vimeo: VimeoMark,
  dailymotion: DailymotionMark,
  peertube: PeertubeMark,
  lemmy: LemmyMark,
  misskey: MisskeyMark,
  tumblr: TumblrMark,
  viber: Phone,
  applemusic: Music,
  soundcloud: Music,
  bandcamp: Music,
  tidal: Music,
  deezer: Music,
  calcom: Calendar,
  calendly: Calendar,
  paypal: CreditCard,
  stripe: CreditCard,
  revolut: CreditCard,
  bancontact: CreditCard,
  payconiq: CreditCard,
  tikkie: CreditCard,
  lightning: Wallet,
  evm: Wallet,
  kofi: Coffee,
  bmac: Coffee,
  website: Globe,
  web: Globe,
  link: LinkIcon,
  vcard: LinkIcon,
  sms: MessageCircle,
  send: Send,
};

/**
 * Resolves an official platform icon from either a full URL
 * (`https://bsky.app/profile/x`) or a bare keyword (`bluesky`, `Matrix`).
 * Unknown values fall back to a clean Globe (URL-ish) or Link icon.
 */
export function getSocialPlatformIcon(urlOrName: string): PlatformIcon {
  const raw = (urlOrName ?? "").trim();
  if (!raw) return LinkIcon;

  // E-mail en telefoon eerst: een adres op mastodon.social of bsky.social is
  // nog altijd een e-mailadres en krijgt altijd een envelop.
  if (isEmailLike(raw)) return Mail;
  if (/^(tel|sms):/i.test(raw)) return Phone;

  // 0 — Harde merkkaart eerst: een bekend platform krijgt altijd zijn eigen
  // officiële vector, nooit een generiek icoon.
  const brand = lookupBrandIcon(raw);
  if (brand) return svg(brand.path, brand.viewBox);

  // 1 — URL form: match on hostname so query strings never confuse the parser.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let host = "";
  try {
    host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  if (host && raw.includes(".")) {
    for (const [pattern, Icon] of HOST_MAP) if (pattern.test(host)) return Icon;
  }

  // 2 — Keyword form: exact kind/label, then a loose contains match.
  const key = raw
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[\s/]+/g, "");
  if (NAME_MAP[key]) return NAME_MAP[key];
  for (const [name, Icon] of Object.entries(NAME_MAP)) {
    if (name.length > 3 && key.includes(name)) return Icon;
  }

  // 3 — A fediverse handle (@user@domain) still resolves to Mastodon.
  if (/^@?[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(raw)) return MastodonIcon;

  // 4 — Onbekende bestemming: een net link-symbool, geen wereldbol voor iets
  // dat op een sociaal netwerk lijkt. Alleen kale websites krijgen de globe.
  return /^(https?:\/\/)?[^@\s]+\.[a-z]{2,}(\/|$)/i.test(raw) && !raw.includes("@")
    ? Globe
    : LinkIcon;
}

/** `mailto:` of een kaal adres (zonder leidende @, die is voor Fediverse-handles). */
export function isEmailLike(raw: string): boolean {
  const v = raw.trim();
  if (/^mailto:/i.test(v)) return true;
  return /^[^@\s/:]+@[^@\s/]+\.[a-z]{2,}$/i.test(v);
}

/** Hostnaam van een gewone webadres-link, of null. */
function websiteHost(raw: string): string | null {
  if (!/^https?:\/\//i.test(raw) && !/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return null;
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export type LinkIconMode = "favicon" | "globe";

/**
 * Merkicoon-renderer. Bekende platformen renderen in hun officiële merkkleur;
 * onbekende bronnen blijven neutraal en volgen het thema.
 */
export function SocialPlatformIcon({
  source,
  className,
  monochrome = false,
  iconMode = "favicon",
  kind,
}: {
  source: string;
  /** Platformsleutel (bv. "mastodon") als terugval wanneer de URL een eigen domein is. */
  kind?: string;
  className?: string;
  /** Forceert themakleur in plaats van de merkkleur. */
  monochrome?: boolean;
  /** Eigen links: favicon van de site (standaard) of altijd de wereldbol. */
  iconMode?: LinkIconMode;
}) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const Icon = getSocialPlatformIcon(source);
  const brand = isEmailLike(source) ? null : lookupBrandIcon(source) ?? (kind ? lookupBrandIcon(kind) : null);
  if (brand?.image) {
    return <img src={brand.image} alt="" aria-hidden className={cn("h-5 w-5 shrink-0 rounded-[22%] object-contain", className)} />;
  }
  if (brand) {
    // Officieel merkteken altijd tekenen, nooit een generieke wereldbol/link.
    return (
      <svg
        viewBox={brand.viewBox ?? "0 0 24 24"}
        className={cn("h-5 w-5 shrink-0", monochrome ? "text-foreground" : "", className)}
        style={monochrome ? { fill: "currentColor" } : { fill: brand.color }}
        aria-hidden
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const host = Icon === Globe && iconMode !== "globe" ? websiteHost(source) : null;
  if (host && !faviconFailed) {
    return (
      <img
        src={`/api/public/brand-logo?domain=${encodeURIComponent(host)}`}
        alt=""
        aria-hidden
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFaviconFailed(true)}
        className={cn("h-5 w-5 shrink-0 rounded-sm object-contain", className)}
      />
    );
  }
  return (
    <Icon
      className={cn("h-5 w-5 shrink-0 text-foreground", className)}
      aria-hidden
    />
  );
}
