from config.errors import AppError


def _err(code: str, key: str, status: int = 400) -> type[AppError]:
    return type(
        code, (AppError,), {"code": code, "message_key": f"errors.wallet.{key}", "status_code": status}
    )


IdempotencyKeyRequired = _err("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKeyRequired")
AccountSuspended = _err("ACCOUNT_SUSPENDED", "accountSuspended", 403)
AmountInvalid = _err("AMOUNT_INVALID", "amountInvalid")
TransferRecipientNotFound = _err("TRANSFER_RECIPIENT_NOT_FOUND", "transferRecipientNotFound", 404)
TransferSelf = _err("TRANSFER_SELF", "transferSelf")
TransferBelowMin = _err("TRANSFER_BELOW_MIN", "transferBelowMin")
TransferLimit = _err("TRANSFER_LIMIT", "transferLimit", 409)
TransferNotTransferable = _err("TRANSFER_NOT_TRANSFERABLE", "transferNotTransferable", 409)
NoBankAccount = _err("NO_BANK_ACCOUNT", "noBankAccount", 409)
BankAccountLocked = _err("BANK_ACCOUNT_LOCKED", "bankAccountLocked", 409)
WithdrawBelowMin = _err("WITHDRAW_BELOW_MIN", "withdrawBelowMin")
WithdrawLimit = _err("WITHDRAW_LIMIT", "withdrawLimit", 409)
WithdrawNotWithdrawable = _err("WITHDRAW_NOT_WITHDRAWABLE", "withdrawNotWithdrawable", 409)
WithdrawalNotPending = _err("WITHDRAWAL_NOT_PENDING", "withdrawalNotPending", 409)
TopupAboveCap = _err("TOPUP_ABOVE_CAP", "topupAboveCap")
