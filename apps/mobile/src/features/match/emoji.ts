// Emoji glyphs for the preset reaction keys (the names are i18n keys `reactions.emoji.<key>`). A
// module of its own so screens outside the match (shop, live) don't load the match panels.

export const EMOJI: Record<string, string> = {
  smile: "\u{1F642}",
  laugh: "\u{1F604}",
  wow: "\u{1F62E}",
  sad: "\u{1F61E}",
  angry: "\u{1F620}",
  thumbs_up: "\u{1F44D}",
  clap: "\u{1F44F}",
  fire: "\u{1F525}",
  think: "\u{1F914}",
  cool: "\u{1F60E}",
};
export const FREE_EMOJIS = Object.keys(EMOJI);
export const FREE_PHRASES = ["hello", "good_luck", "nice_move", "well_played", "thanks", "oops", "hurry", "good_game"];
