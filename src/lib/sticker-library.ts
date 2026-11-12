/** Bibliotheek met decoratie-stickers voor de gelaagde Design Studio, per categorie. */
export type StickerCategory = { id: string; label: string; stickers: string[] };

const split = (s: string) => Array.from(new Intl.Segmenter("nl", { granularity: "grapheme" }).segment(s), (x) => x.segment).filter((x) => x.trim());

export const STICKER_CATEGORIES: StickerCategory[] = [
  { id: "natuur", label: "Natuur", stickers: split("🌸🌺🌻🌼🌷🌹🍀🌿🍃🍂🍁🌵🌴🌲🌊🌙☀️🌈⛅❄️") },
  { id: "feest", label: "Feest", stickers: split("🎉🎊🎈🎁🎂🥳🎆🎇🪅🎀🍾🥂🎶🪩🕯️") },
  { id: "liefde", label: "Liefde", stickers: split("❤️🧡💛💚💙💜🤍🖤💖💕💞💘💝💌😍") },
  { id: "ruimte", label: "Ruimte", stickers: split("✨⭐🌟💫☄️🪐🌍🚀🛸👽🌌🔭") },
  { id: "dieren", label: "Dieren", stickers: split("🐱🐶🦊🐼🐨🐸🦄🐝🦋🐢🐙🐳🦁🐧🦉") },
  { id: "eten", label: "Eten", stickers: split("🍕🍔🍩🍪🧁🍓🍉🍋🥑☕🧋🍦") },
  { id: "werk", label: "Werk & tech", stickers: split("💻📱⌨️🎧📷🎨✏️📚💡⚙️🧠📈🔥⚡🎯") },
  { id: "sport", label: "Sport & spel", stickers: split("⚽🏀🎾🏐🎮🕹️🎲🏆🥇🛹🏄🚴") },
  { id: "vormen", label: "Vormen", stickers: split("🔴🟠🟡🟢🔵🟣⚫⚪🔺🔷💠🔶") },
];

export const ALL_STICKERS: string[] = STICKER_CATEGORIES.flatMap((c) => c.stickers);
