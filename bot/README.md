# Bot service

Move and cube decisions for bot matches (CLAUDE.md §9). Pure Python on top of the rules engine in
`backend/game/engine` (imported as `game.engine`, so `backend/` must be on `PYTHONPATH`).

- `evaluator.py`: heuristic position evaluation (pip count, blots and shots, made points, primes,
  home board, bear-off). Implements the `Evaluator` protocol so `hard` can later use a neural net.
- `brain.py`: `choose_move(position, player, dice, level, seed)` and `cube_decision(...)`, with
  noise that shrinks with the level (`easy`, `medium`, `hard`). Noise is derived from a hash of
  the inputs and a seed, so a decision is reproducible.
- `service.py`: a small ASGI app (`uvicorn bot.service:app --port 8100`): `POST /move`,
  `POST /cube`, `GET /health`.

The game server calls it (`BOT_URL`) and falls back to the first legal play if it is unreachable.

Tests: `cd backend && PYTHONPATH=..:. pytest ../bot/tests`.
