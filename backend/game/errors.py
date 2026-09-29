from config.errors import AppError


def _err(code: str, key: str, status: int = 400) -> type[AppError]:
    return type(
        code, (AppError,), {"code": code, "message_key": f"errors.match.{key}", "status_code": status}
    )


MatchInProgress = _err("MATCH_IN_PROGRESS", "inProgress", 409)
LengthNotAllowed = _err("MATCH_LENGTH_NOT_ALLOWED", "lengthNotAllowed")
AccountSuspended = _err("ACCOUNT_SUSPENDED", "accountSuspended", 403)
ReplayPurged = _err("REPLAY_PURGED", "replayPurged", 410)
BotEntryChanged = _err("BOT_ENTRY_CHANGED", "botEntryChanged", 409)
