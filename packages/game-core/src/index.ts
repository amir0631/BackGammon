// Client-side match state store, legal-move highlighting, and replay player (CLAUDE.md §4).
// Implemented in §17 steps 5–8. The server stays authoritative (CLAUDE.md §2 rule 1):
// nothing here decides dice, moves, timers, or results.

export const GAME_CORE_VERSION = 0;
