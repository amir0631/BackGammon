"""Provably fair dice (CLAUDE.md §6). The match seed is committed at match start and published at the end;
anyone can then recompute every roll and check the commitment."""

import hashlib
import hmac
import secrets

SEED_BYTES = 32
_ACCEPT_BELOW = 252  # 252 = 42 * 6: bytes at or above it would bias the faces


def new_seed() -> bytes:
    return secrets.token_bytes(SEED_BYTES)


def commit(seed: bytes) -> str:
    return hashlib.sha256(seed).hexdigest()


def verify_commit(seed: bytes, seed_commit: str) -> bool:
    return hmac.compare_digest(commit(seed), seed_commit)


def roll(seed: bytes, match_id: str, n: int) -> tuple[int, int]:
    """Roll number `n` (0-based, match-wide): bytes of HMAC-SHA256(seed, "match:n:k") for k = 0, 1, …,
    accepting a byte b only when b < 252; die = b % 6 + 1."""
    dice: list[int] = []
    k = 0
    while len(dice) < 2:
        digest = hmac.new(seed, f"{match_id}:{n}:{k}".encode(), hashlib.sha256).digest()
        for b in digest:
            if b < _ACCEPT_BELOW:
                dice.append(b % 6 + 1)
                if len(dice) == 2:
                    break
        k += 1
    return dice[0], dice[1]


def throw_seed(seed: bytes, match_id: str, n: int) -> int:
    """Drives only the 3D throw animation; never influences the values (§6.4, §11.1)."""
    digest = hmac.new(seed, f"{match_id}:{n}:throw".encode(), hashlib.sha256).digest()
    return int.from_bytes(digest[:4], "big")
