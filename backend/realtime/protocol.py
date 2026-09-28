"""WebSocket protocol (CLAUDE.md §10.3). These pydantic models are the single source: the TypeScript
types in packages/protocol/src/ws.ts are generated from them (`manage.py protocol_ts`) and a contract
test fails when the two drift.

Envelope, both directions: {"type", "match_id", "seq", "payload"}. Moves use the mover's own point
numbering (25 = bar, 0 = off); positions use the engine's 28-number encoding.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Envelope(_Model):
    type: str
    match_id: str | None = None
    seq: int = 0
    payload: dict[str, Any] = Field(default_factory=dict)


# ---- Client → server ----


class AuthIn(_Model):
    """First message on every connection: a token from GET /api/v1/auth/ws-token (valid 60 s)."""

    token: str = Field(max_length=2000)


class QueueJoinIn(_Model):
    tier_id: int  # the tier's entry fee (GET /api/v1/tiers)
    variant: Literal["standard_cube", "standard_nocube", "traditional"]
    length: int


class EmptyIn(_Model):
    pass


class MatchSyncIn(_Model):
    last_seq: int = Field(default=0, ge=0)


class TurnMoveIn(_Model):
    moves: list[list[int]] = Field(max_length=4)


class ReactSendIn(_Model):
    emoji_key: str | None = Field(default=None, max_length=40)
    phrase_key: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _one_key(self) -> "ReactSendIn":
        if (self.emoji_key is None) == (self.phrase_key is None):
            raise ValueError("exactly one of emoji_key and phrase_key")
        return self


class MatchResignIn(_Model):
    scope: Literal["game", "match"]


class SpectateReactIn(_Model):
    emoji_key: str = Field(max_length=40)


CLIENT_MESSAGES: dict[str, type[_Model]] = {
    "auth": AuthIn,
    "queue.join": QueueJoinIn,
    "queue.leave": EmptyIn,
    "match.sync": MatchSyncIn,
    "turn.roll": EmptyIn,
    "turn.move": TurnMoveIn,
    "cube.offer": EmptyIn,
    "cube.take": EmptyIn,
    "cube.drop": EmptyIn,
    "react.send": ReactSendIn,
    "match.resign": MatchResignIn,
    "spectate.join": EmptyIn,
    "spectate.leave": EmptyIn,
    "spectate.react": SpectateReactIn,
}

# ---- Server → client ----


class AuthOkOut(_Model):
    username: str | None


class ErrorOut(_Model):
    code: str
    message_key: str
    details: dict[str, Any] = Field(default_factory=dict)


class PlayerInfo(_Model):
    """A player's public profile (never the phone number, §2 rule 11)."""

    username: str
    avatar: str
    elo: int
    level: int
    is_bot: bool
    bot_level: str | None
    board_theme: str
    checker_theme: str
    connected: bool


class Clock(_Model):
    """Deadlines are Unix epoch milliseconds from the server clock; `server_now` lets clients correct
    for skew."""

    actor: int | None
    deadline: int | None
    bank: list[float]
    turn_seconds: int
    server_now: int


class MatchFoundOut(_Model):
    match_id: str
    you: int
    opponent: PlayerInfo
    seed_commit: str
    variant: str
    length: int
    entry: int


class GameResultOut(_Model):
    game_no: int
    winner: int
    kind: Literal["single", "gammon", "backgammon"]
    cube: int
    points: int
    reason: Literal["bear_off", "drop", "resign"]


class MatchRulesOut(_Model):
    """The values this match snapshotted when it started (§14); later setting changes never apply."""

    turn_seconds: int
    timebank_seconds: int
    max_consecutive_timeouts: int
    reconnect_grace_seconds: int
    points: dict[str, int]  # single / gammon / backgammon, before the cube
    rake_pct: int
    payout: int  # what the match winner receives (0 when there is no entry fee)


class MatchStateOut(_Model):
    match_id: str
    status: Literal["active", "finished", "aborted", "voided"]
    you: int | None
    players: list[PlayerInfo]
    variant: str
    length: int
    entry: int
    seed_commit: str
    score: list[int]
    game_no: int
    crawford_game: bool
    phase: Literal["opening", "roll", "move", "cube_offered", "game_over", "match_over"]
    position: str
    turn: int | None
    dice: list[int] | None
    cube_value: int
    cube_owner: int | None
    can_double: bool
    legal: list[list[list[int]]]
    clock: Clock
    timeouts: list[int]
    results: list[GameResultOut]
    winner: int | None
    end_reason: str | None
    spectators: int
    rules: MatchRulesOut
    grace: list[int | None]  # per side: epoch ms when an absent player forfeits (or the match aborts)


class TurnRolledOut(_Model):
    player: int | None  # None for the opening roll (one die each)
    opening: bool
    dice: list[int]
    throw_seed: int
    legal: list[list[list[int]]]
    clock: Clock


class TurnMovedOut(_Model):
    player: int
    moves: list[list[int]]
    hits: list[bool]
    position: str
    auto: Literal["forced", "timeout"] | None
    clock: Clock


class TurnPassedOut(_Model):
    player: int
    clock: Clock


class TurnTimeoutOut(_Model):
    player: int
    count: int
    limit: int


class CubeUpdateOut(_Model):
    action: Literal["offer", "take", "drop"]
    player: int
    value: int
    owner: int | None
    clock: Clock


class GameStartedOut(_Model):
    game_no: int
    crawford: bool
    score: list[int]
    position: str


class GameEndedOut(GameResultOut):
    score: list[int]


class ReactRecvOut(_Model):
    key: str
    kind: Literal["emoji", "phrase"]
    sender: int


class OpponentDisconnectedOut(_Model):
    player: int
    grace_seconds: int


class OpponentBackOut(_Model):
    player: int


class MatchEndedOut(_Model):
    winner: int | None  # None when aborted before the first roll (entries refunded)
    score: list[int]
    reason: str
    seed: str
    elo: dict[str, int] | None
    xp: dict[str, int] | None
    settlement: dict[str, int] | None


class QueueStatusOut(_Model):
    state: Literal["waiting", "left", "removed"]
    tier_id: int
    variant: str
    length: int
    reason: str | None


class PoolUpdateOut(_Model):
    total_a: int
    total_b: int
    open: bool


class SpectatorsCountOut(_Model):
    count: int


class SpectateReactRecvOut(_Model):
    key: str


SERVER_MESSAGES: dict[str, type[_Model]] = {
    "auth.ok": AuthOkOut,
    "error": ErrorOut,
    "match.found": MatchFoundOut,
    "queue.status": QueueStatusOut,
    "match.state": MatchStateOut,
    "turn.rolled": TurnRolledOut,
    "turn.moved": TurnMovedOut,
    "turn.passed": TurnPassedOut,
    "turn.timeout": TurnTimeoutOut,
    "cube.update": CubeUpdateOut,
    "game.started": GameStartedOut,
    "game.ended": GameEndedOut,
    "react.recv": ReactRecvOut,
    "opponent.disconnected": OpponentDisconnectedOut,
    "opponent.back": OpponentBackOut,
    "match.ended": MatchEndedOut,
    "pool.update": PoolUpdateOut,
    "spectate.state": MatchStateOut,
    "spectators.count": SpectatorsCountOut,
    "spectate.react": SpectateReactRecvOut,
}
