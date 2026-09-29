"""Preset reactions (CLAUDE.md §1: preset emojis and phrases only, never free text). Keys are rendered
by the receiver in its own locale (i18n `reactions.emoji.<key>` / `reactions.phrase.<key>`). The shop
adds packs in §17 step 10; these are the free defaults."""

FREE_EMOJIS = ("smile", "laugh", "wow", "sad", "angry", "thumbs_up", "clap", "fire", "think", "cool")
FREE_PHRASES = ("hello", "good_luck", "nice_move", "well_played", "thanks", "oops", "hurry", "good_game")
RATE_SECONDS = 3.0  # §10.3: 1 per 3 s


def allowed(kind: str, key: str, user_id: int | None = None) -> bool:
    """A player may send the keys of the packs they own (§17 step 10); spectators the free emojis."""
    if key in (FREE_EMOJIS if kind == "emoji" else FREE_PHRASES):
        return True  # the free default packs, open to everyone
    if user_id is None:
        return False
    from shop.services import reaction_keys

    return key in reaction_keys(user_id)[kind]
