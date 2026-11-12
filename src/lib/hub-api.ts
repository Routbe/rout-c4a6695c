/**
 * Profile-hub developer surface.
 *
 * The profile hub is considerably larger than the QR generator: it covers the
 * public profile, its links, socials, gallery, bookings, donations, badge and
 * lead capture. These definitions are the single source of truth for the
 * `/api/hub` documentation page and its test console.
 */
import type { McpToolDef } from "@/lib/mcp-tools";

export const HUB_MCP_TOOLS: McpToolDef[] = [
  {
    name: "get_profile",
    title: "Get profile",
    description:
      "Returns the full public profile for a handle: display name, bio, avatar, theme, verification state and counts for links, socials and gallery items.",
    readOnly: true,
    params: [
      { name: "handle", type: "string", required: true, description: "Profile handle without the @." },
      {
        name: "include",
        type: "object",
        required: false,
        description:
          "Optional expansions, e.g. { links: true, socials: true, gallery: true, bookings: false }.",
      },
    ],
    sampleInput: { handle: "delplanche", include: { links: true, socials: true } },
    sampleOutput: {
      handle: "delplanche",
      display_name: "Delplanche",
      bio: "Studio voor merk en ruimte.",
      avatar_url: "https://rout.be/api/public/avatar?handle=delplanche",
      verified: true,
      theme: "midnight",
      counts: { links: 7, socials: 4, gallery: 12 },
    },
  },
  {
    name: "update_profile",
    title: "Update profile",
    description:
      "Patches profile fields. Only the keys you send are changed; handle changes keep the old handle as a permanent redirect.",
    readOnly: false,
    params: [
      { name: "display_name", type: "string", required: false, description: "Public name." },
      { name: "bio", type: "string", required: false, description: "Short bio, max 280 characters." },
      { name: "avatar_url", type: "string", required: false, description: "Publicly reachable image URL." },
      {
        name: "theme",
        type: "enum",
        required: false,
        description: "Visual theme of the hub.",
        values: ["light", "midnight", "paper", "neon"],
      },
      { name: "location", type: "string", required: false, description: "City or region shown on the hub." },
    ],
    sampleInput: { display_name: "Delplanche Studio", bio: "Studio voor merk en ruimte.", theme: "midnight" },
    sampleOutput: { handle: "delplanche", updated_at: "2026-09-12T10:00:00.000Z", updated_fields: ["display_name", "bio", "theme"] },
  },
  {
    name: "list_hub_links",
    title: "List hub links",
    description: "Returns every link block on the hub in display order, including click totals and scheduling.",
    readOnly: true,
    params: [
      { name: "handle", type: "string", required: true, description: "Profile handle." },
      {
        name: "status",
        type: "enum",
        required: false,
        description: "Filter by publication state.",
        values: ["all", "live", "scheduled", "hidden"],
      },
    ],
    sampleInput: { handle: "delplanche", status: "live" },
    sampleOutput: {
      links: [
        { id: "lnk_18ab", title: "Portfolio", url: "https://delplanche.com", position: 1, clicks: 4210, status: "live" },
        { id: "lnk_22cd", title: "Maak een afspraak", url: "https://rout.be/delplanche/book", position: 2, clicks: 318, status: "live" },
      ],
      total: 2,
    },
  },
  {
    name: "create_hub_link",
    title: "Create hub link",
    description:
      "Adds a link block to the hub. Supports scheduling, pinning and an optional thumbnail; the block is appended unless a position is given.",
    readOnly: false,
    params: [
      { name: "title", type: "string", required: true, description: "Label shown on the button." },
      { name: "url", type: "string", required: true, description: "Destination URL." },
      { name: "position", type: "number", required: false, description: "1-based position in the list." },
      { name: "pinned", type: "boolean", required: false, description: "Pin above all other blocks." },
      { name: "scheduled_at", type: "string", required: false, description: "ISO timestamp to publish at." },
      { name: "expires_at", type: "string", required: false, description: "ISO timestamp to hide at." },
      { name: "thumbnail_url", type: "string", required: false, description: "Small image next to the label." },
    ],
    sampleInput: { title: "Nieuwe collectie", url: "https://delplanche.com/collectie", pinned: true },
    sampleOutput: { id: "lnk_31ef", title: "Nieuwe collectie", position: 1, status: "live" },
  },
  {
    name: "update_hub_link",
    title: "Update or reorder hub link",
    description: "Edits a single link block: title, destination, position, pin state, schedule or visibility.",
    readOnly: false,
    params: [
      { name: "id", type: "string", required: true, description: "Link block id." },
      { name: "title", type: "string", required: false, description: "New label." },
      { name: "url", type: "string", required: false, description: "New destination." },
      { name: "position", type: "number", required: false, description: "New 1-based position." },
      { name: "hidden", type: "boolean", required: false, description: "Hide without deleting." },
    ],
    sampleInput: { id: "lnk_22cd", position: 1 },
    sampleOutput: { id: "lnk_22cd", position: 1, updated_at: "2026-09-12T10:02:00.000Z" },
  },
  {
    name: "delete_hub_link",
    title: "Delete hub link",
    description: "Removes a link block permanently. Click history is retained in analytics for 90 days.",
    readOnly: false,
    params: [{ name: "id", type: "string", required: true, description: "Link block id." }],
    sampleInput: { id: "lnk_31ef" },
    sampleOutput: { id: "lnk_31ef", deleted: true },
  },
  {
    name: "manage_socials",
    title: "Manage social accounts",
    description:
      "Adds, updates or removes a social icon on the hub. Follower counts are synced nightly for supported platforms.",
    readOnly: false,
    params: [
      {
        name: "action",
        type: "enum",
        required: true,
        description: "Operation to apply.",
        values: ["add", "update", "remove"],
      },
      {
        name: "platform",
        type: "enum",
        required: true,
        description: "Social network.",
        values: ["instagram", "linkedin", "github", "x", "mastodon", "youtube", "tiktok", "bluesky"],
      },
      { name: "username", type: "string", required: false, description: "Handle on that platform." },
    ],
    sampleInput: { action: "add", platform: "instagram", username: "delplanche" },
    sampleOutput: { platform: "instagram", username: "delplanche", followers: 8420, synced_at: "2026-09-12T03:00:00.000Z" },
  },
  {
    name: "manage_gallery",
    title: "Manage gallery",
    description: "Lists, adds or removes gallery media on the hub. Images are optimised and served from the ROUT CDN.",
    readOnly: false,
    params: [
      {
        name: "action",
        type: "enum",
        required: true,
        description: "Operation to apply.",
        values: ["list", "add", "remove", "reorder"],
      },
      { name: "media_url", type: "string", required: false, description: "Source image or video URL when adding." },
      { name: "caption", type: "string", required: false, description: "Caption shown under the media." },
      { name: "id", type: "string", required: false, description: "Media id when removing or reordering." },
    ],
    sampleInput: { action: "add", media_url: "https://cdn.example.com/shot.jpg", caption: "Atelier" },
    sampleOutput: { id: "med_77aa", caption: "Atelier", position: 13 },
  },
  {
    name: "list_bookings",
    title: "List bookings",
    description:
      "Returns booking requests for the hub calendar within a window, with their status and the visitor's contact details.",
    readOnly: true,
    params: [
      { name: "from", type: "string", required: false, description: "ISO date lower bound." },
      { name: "to", type: "string", required: false, description: "ISO date upper bound." },
      {
        name: "status",
        type: "enum",
        required: false,
        description: "Filter by booking state.",
        values: ["all", "pending", "confirmed", "cancelled"],
      },
    ],
    sampleInput: { from: "2026-09-01", to: "2026-09-30", status: "pending" },
    sampleOutput: {
      bookings: [
        { id: "bkg_4c12", name: "Ruth Peeters", email: "ruth@example.com", starts_at: "2026-09-18T09:00:00.000Z", status: "pending" },
      ],
      total: 1,
    },
  },
  {
    name: "update_booking",
    title: "Confirm or cancel booking",
    description: "Confirms, reschedules or cancels a booking and sends the matching e-mail to the visitor.",
    readOnly: false,
    params: [
      { name: "id", type: "string", required: true, description: "Booking id." },
      {
        name: "action",
        type: "enum",
        required: true,
        description: "What to do with the booking.",
        values: ["confirm", "cancel", "reschedule"],
      },
      { name: "starts_at", type: "string", required: false, description: "New ISO start time when rescheduling." },
      { name: "message", type: "string", required: false, description: "Optional note added to the e-mail." },
    ],
    sampleInput: { id: "bkg_4c12", action: "confirm" },
    sampleOutput: { id: "bkg_4c12", status: "confirmed", email_sent: true },
  },
  {
    name: "get_hub_analytics",
    title: "Get hub analytics",
    description:
      "Profile views, link clicks, click-through rate, referrers and countries for a timeframe — enough for an agent to write a weekly report.",
    readOnly: true,
    params: [
      { name: "handle", type: "string", required: true, description: "Profile handle." },
      {
        name: "timeframe",
        type: "enum",
        required: true,
        description: "Reporting window.",
        values: ["24h", "7d", "30d", "all"],
      },
      {
        name: "group_by",
        type: "enum",
        required: false,
        description: "Break the numbers down.",
        values: ["link", "referrer", "country", "device"],
      },
    ],
    sampleInput: { handle: "delplanche", timeframe: "30d", group_by: "link" },
    sampleOutput: {
      views: 18420,
      clicks: 6231,
      ctr: 0.338,
      by_link: [
        { id: "lnk_18ab", title: "Portfolio", clicks: 4210 },
        { id: "lnk_22cd", title: "Maak een afspraak", clicks: 318 },
      ],
    },
  },
  {
    name: "list_leads",
    title: "List leads and newsletter signups",
    description: "Returns contact-form submissions and newsletter signups captured by the hub, newest first.",
    readOnly: true,
    params: [
      {
        name: "source",
        type: "enum",
        required: false,
        description: "Where the lead came from.",
        values: ["all", "contact", "newsletter", "poll"],
      },
      { name: "limit", type: "number", required: false, description: "Maximum rows, default 50." },
    ],
    sampleInput: { source: "newsletter", limit: 25 },
    sampleOutput: {
      leads: [{ id: "led_9911", email: "ruth@example.com", source: "newsletter", created_at: "2026-09-11T18:22:00.000Z" }],
      total: 1,
    },
  },
  {
    name: "get_hub_badge",
    title: "Get verification badge and vCard",
    description:
      "Returns the badge state plus the shareable assets of a hub: badge SVG, OG image and vCard download for offline contact sharing.",
    readOnly: true,
    params: [{ name: "handle", type: "string", required: true, description: "Profile handle." }],
    sampleInput: { handle: "delplanche" },
    sampleOutput: {
      verified: true,
      badge_svg_url: "https://rout.be/api/public/badge/delplanche",
      og_image_url: "https://rout.be/api/public/og/delplanche",
      vcard_url: "https://rout.be/delplanche/vcard",
    },
  },
];

export type HubEndpoint = readonly [method: string, path: string, description: string];

export const HUB_PUBLIC_ENDPOINTS: readonly HubEndpoint[] = [
  ["GET", "/api/public/og/:handle", "Open Graph share image rendered for the profile hub."],
  ["GET", "/api/public/badge/:handle", "Verification badge as an SVG you can embed anywhere."],
  ["GET", "/api/public/avatar?handle=", "Cached, resized avatar image for a handle."],
  ["GET", "/api/public/gallery-media", "Optimised gallery media served from the CDN."],
  ["POST", "/api/public/bookings/:id/:action", "Confirm or cancel a booking from the link in an e-mail."],
  ["GET", "/api/public/health", "Service health probe: status, database and latency."],
];

export const HUB_AUTHED_ENDPOINTS: readonly HubEndpoint[] = [
  ["GET", "/api/hub/profile", "Read the authenticated profile including theme and verification state."],
  ["POST", "/api/hub/profile", "Patch profile fields (display name, bio, avatar, theme, location)."],
  ["GET", "/api/hub/links", "List every link block with position, schedule and click totals."],
  ["POST", "/api/hub/links", "Create a link block; supports pinning and scheduling."],
  ["POST", "/api/hub/links/:id", "Update, reorder, hide or delete a single link block."],
  ["GET", "/api/hub/socials", "List connected social accounts and synced follower counts."],
  ["POST", "/api/hub/socials", "Add, update or remove a social account."],
  ["GET", "/api/hub/gallery", "List gallery media in display order."],
  ["POST", "/api/hub/gallery", "Add, remove or reorder gallery media."],
  ["GET", "/api/hub/bookings", "List booking requests within a window."],
  ["POST", "/api/hub/bookings/:id", "Confirm, reschedule or cancel a booking."],
  ["GET", "/api/hub/analytics", "Views, clicks, CTR, referrers and countries per timeframe."],
  ["GET", "/api/hub/leads", "Contact-form submissions, newsletter signups and poll answers."],
];
