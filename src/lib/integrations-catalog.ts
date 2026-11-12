/** Connections Hub catalogue (browser-safe). */
export type IntegrationCategory =
  | "music" | "gaming" | "streaming" | "socials" | "work" | "health"
  | "design" | "culture" | "home" | "payments";

/**
 * How a tile connects:
 * - oauth   → full sign-in flow (Spotify)
 * - handle  → public username/handle, fetched server-side
 * - address → public wallet address (QR + support button)
 * - soon    → "Binnenkort"
 */
export type ConnectMode = "oauth" | "handle" | "address" | "soon";

export type Integration = {
  id: string;
  label: string;
  category: IntegrationCategory;
  /** Key in simple-icons, "custom:<name>" for an inline logo, or null. */
  icon: string | null;
  mode: ConnectMode;
  /** Input hint for handle/address tiles. */
  placeholder?: string;
  /** Sign-in provider whose verified account can fast-track this tile. */
  sso?: "github" | "gitlab" | "bluesky";
};

const soon = (id: string, label: string, category: IntegrationCategory, icon: string | null): Integration => ({
  id, label, category, icon, mode: "soon",
});

export const INTEGRATIONS: Integration[] = [
  // Muziek
  { id: "spotify", label: "Spotify", category: "music", icon: "siSpotify", mode: "oauth" },
  soon("applemusic", "Apple Music", "music", "siApplemusic"),
  soon("lastfm", "Last.fm", "music", "siLastdotfm"),
  soon("soundcloud", "SoundCloud", "music", "siSoundcloud"),
  soon("deezer", "Deezer", "music", "siDeezer"),
  soon("youtubemusic", "YouTube Music", "music", "siYoutubemusic"),
  // Gaming
  soon("steam", "Steam", "gaming", "siSteam"),
  soon("xbox", "Xbox", "gaming", "custom:xbox"),
  soon("playstation", "PlayStation Network", "gaming", "siPlaystation"),
  soon("riot", "Riot Games", "gaming", "siRiotgames"),
  soon("epic", "Epic Games", "gaming", "siEpicgames"),
  soon("battlenet", "Battle.net", "gaming", "siBattledotnet"),
  soon("roblox", "Roblox", "gaming", "siRoblox"),
  // Streaming
  soon("twitch", "Twitch", "streaming", "siTwitch"),
  { id: "youtube", label: "YouTube", category: "streaming", icon: "siYoutube", mode: "handle", placeholder: "@kanaal of UC… kanaal-ID" },
  soon("kick", "Kick", "streaming", "siKick"),
  // Socials
  { id: "bluesky", label: "Bluesky", category: "socials", icon: "siBluesky", mode: "handle", placeholder: "naam.bsky.social", sso: "bluesky" },
  { id: "wsocial", label: "wsocial.eu", category: "socials", icon: "custom:wsocial", mode: "handle", placeholder: "gebruikersnaam of eigen domein" },
  soon("instagram", "Instagram", "socials", "siInstagram"),
  soon("tiktok", "TikTok", "socials", "siTiktok"),
  soon("x", "X", "socials", "siX"),
  soon("discord", "Discord", "socials", "siDiscord"),
  soon("reddit", "Reddit", "socials", "siReddit"),
  { id: "mastodon", label: "Mastodon", category: "socials", icon: "siMastodon", mode: "handle", placeholder: "@naam@mastodon.social" },
  soon("threads", "Threads", "socials", "siThreads"),
  { id: "snapchat", label: "Snapchat", category: "socials", icon: "siSnapchat", mode: "oauth" },
  soon("tumblr", "Tumblr", "socials", "siTumblr"),
  soon("pixelfed", "Pixelfed", "socials", "siPixelfed"),
  // Werk & Code
  { id: "github", label: "GitHub", category: "work", icon: "siGithub", mode: "handle", placeholder: "gebruikersnaam", sso: "github" },
  { id: "gitlab", label: "GitLab", category: "work", icon: "siGitlab", mode: "handle", placeholder: "gebruikersnaam", sso: "gitlab" },
  { id: "wakatime", label: "WakaTime", category: "work", icon: "siWakatime", mode: "handle", placeholder: "gebruikersnaam (publiek profiel)" },
  soon("linkedin", "LinkedIn", "work", "custom:linkedin"),
  // Gezondheid & Fitness
  soon("strava", "Strava", "health", "siStrava"),
  soon("oura", "Oura", "health", null),
  soon("garmin", "Garmin", "health", "siGarmin"),
  soon("applehealth", "Apple Health", "health", "siApple"),
  soon("googlefit", "Google Fit", "health", "siGooglefit"),
  // Design & Portfolio
  soon("vsco", "VSCO", "design", "siVsco"),
  soon("behance", "Behance", "design", "siBehance"),
  soon("dribbble", "Dribbble", "design", "siDribbble"),
  soon("figma", "Figma", "design", "siFigma"),
  soon("artstation", "ArtStation", "design", "siArtstation"),
  soon("pinterest", "Pinterest", "design", "siPinterest"),
  // Cultuur & Vrije Tijd
  soon("letterboxd", "Letterboxd", "culture", "siLetterboxd"),
  { id: "chesscom", label: "Chess.com", category: "culture", icon: "siChessdotcom", mode: "handle", placeholder: "Chess.com-gebruikersnaam" },
  { id: "duolingo", label: "Duolingo", category: "culture", icon: "siDuolingo", mode: "handle", placeholder: "Duolingo-gebruikersnaam" },
  { id: "lichess", label: "Lichess", category: "culture", icon: "siLichess", mode: "handle", placeholder: "Lichess-gebruikersnaam" },
  soon("storygraph", "StoryGraph", "culture", null),
  soon("goodreads", "Goodreads", "culture", "siGoodreads"),
  // Smart Home & Zelf-Gehost
  soon("homeassistant", "Home Assistant", "home", "siHomeassistant"),
  { id: "rss", label: "RSS / Blog", category: "home", icon: "siRss", mode: "handle", placeholder: "Feed-URL, naam.substack.com of medium.com/@naam" },
  soon("matrix", "Matrix / Element", "home", "siMatrix"),
  // Support & Betalingen
  { id: "lightning", label: "Bitcoin Lightning", category: "payments", icon: "siBitcoin", mode: "address", placeholder: "naam@wallet.com of lnurl…" },
  { id: "monero", label: "Monero (XMR)", category: "payments", icon: "siMonero", mode: "address", placeholder: "4… publiek adres" },
  { id: "ethereum", label: "Ethereum", category: "payments", icon: "siEthereum", mode: "address", placeholder: "0x… publiek adres" },
  soon("stripe", "Stripe", "payments", "siStripe"),
  soon("buymeacoffee", "Buy Me a Coffee", "payments", "siBuymeacoffee"),
  soon("paypal", "PayPal", "payments", "siPaypal"),
];

export const INTEGRATION_FILTERS = [
  { id: "popular", label: "Populair" },
  { id: "music", label: "Muziek" },
  { id: "gaming", label: "Gaming" },
  { id: "streaming", label: "Streaming" },
  { id: "socials", label: "Socials" },
  { id: "work", label: "Werk & Code" },
  { id: "health", label: "Gezondheid & Fitness" },
  { id: "design", label: "Design & Portfolio" },
  { id: "culture", label: "Cultuur & Vrije Tijd" },
  { id: "home", label: "Smart Home & Zelf-Gehost" },
  { id: "payments", label: "Support & Betalingen" },
  { id: "all", label: "Alles" },
] as const;

export type IntegrationFilter = (typeof INTEGRATION_FILTERS)[number]["id"];

const POPULAR = ["spotify", "youtube", "github", "bluesky", "wsocial", "wakatime", "lightning", "xbox"];

export function integrationById(id: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

export function filterIntegrations(filter: IntegrationFilter): Integration[] {
  if (filter === "all") return INTEGRATIONS;
  if (filter === "popular") return POPULAR.map((id) => integrationById(id)!).filter(Boolean);
  return INTEGRATIONS.filter((i) => i.category === filter);
}

export function isLive(item: Integration): boolean {
  return item.mode !== "soon";
}

/** Data a live component may show, per platform (only what the public fetchers return). */
export type LiveStatKey = "followers" | "repos" | "bio" | "activity" | "blitz" | "rapid" | "online" | "challenge" | "videos" | "videoCount" | "posts" | "streak" | "language" | "xp";

export const LIVE_STAT_LABELS: Record<LiveStatKey, string> = {
  followers: "Aantal volgers",
  repos: "Aantal repo's",
  bio: "Bio",
  activity: "Laatste activiteit",
  blitz: "Blitz-rating",
  rapid: "Rapid-rating",
  online: "Online-status",
  challenge: "Uitdaag-knop",
  videos: "Nieuwste video's",
  videoCount: "Aantal video's",
  posts: "Laatste posts",
  streak: "Streak",
  language: "Taal die je leert",
  xp: "Totaal XP",
};

const LIVE_STATS: Record<string, LiveStatKey[]> = {
  github: ["repos", "followers", "activity", "bio"],
  gitlab: ["activity"],
  mastodon: ["followers", "bio", "activity"],
  bluesky: ["followers", "bio", "activity"],
  wsocial: ["followers", "bio", "activity"],
  wakatime: ["activity"],
  lichess: ["blitz", "rapid", "online", "challenge"],
  chesscom: ["blitz", "rapid", "online", "challenge"],
  youtube: ["videoCount", "videos", "activity"],
  rss: ["posts"],
  duolingo: ["streak", "language", "xp"],
};

export function liveStatOptions(provider: string): LiveStatKey[] {
  return LIVE_STATS[provider] ?? [];
}

/** Selected stats; undefined (never chosen) = all options. Unknown keys are dropped. */
export function shownLiveStats(provider: string, selected: unknown): Set<LiveStatKey> {
  const opts = liveStatOptions(provider);
  if (!Array.isArray(selected)) return new Set(opts);
  return new Set(opts.filter((k) => selected.includes(k)));
}
