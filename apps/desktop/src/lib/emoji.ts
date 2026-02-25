import data from "emojibase-data/en/data.json";

type EmojiEntry = {
  shortcode: string;
  emoji: string;
  keywords: string[];
};

const EMOJI_ENTRIES: EmojiEntry[] = data.flatMap((item: any) => {
  const codes =
    item.shortcodes && item.shortcodes.length > 0
      ? item.shortcodes
      : [item.label?.replace(/\s+/g, "_") ?? ""];

  const emojiChar = item.hexcode
    ? String.fromCodePoint(
        ...item.hexcode.split("-").map((h: string) => parseInt(h, 16)),
      )
    : "";

  return codes.map((shortcode: string) => ({
    shortcode,
    emoji: emojiChar,
    keywords: item.tags ?? [],
  }));
});

const CUSTOM_EMOJI_ENTRIES: EmojiEntry[] = [
  {
    shortcode: "tm",
    emoji: "™",
    keywords: ["tm", "trademark"],
  },
];

EMOJI_ENTRIES.push(...CUSTOM_EMOJI_ENTRIES);

const EMOJI_BY_SHORTCODE = new Map(
  EMOJI_ENTRIES.map((entry) => [entry.shortcode.toLowerCase(), entry.emoji]),
);

export type EmojiSuggestion = {
  shortcode: string;
  emoji: string;
};

export const replaceEmojiShortcodes = (value: string) =>
  value.replace(/:([a-z0-9_+\-]+):/gi, (full, raw) => {
    const shortcode = String(raw).toLowerCase();
    return EMOJI_BY_SHORTCODE.get(shortcode) ?? full;
  });

export const findEmojiSuggestions = (
  query: string,
  limit = 8,
): EmojiSuggestion[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return EMOJI_ENTRIES.filter(
    (entry) =>
      entry.shortcode.includes(normalized) ||
      entry.keywords.some((keyword) => keyword.includes(normalized)),
  )
    .slice(0, limit)
    .map((entry) => ({ shortcode: entry.shortcode, emoji: entry.emoji }));
};
