import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models


class Wallet(models.Model):
    """Cached balance of `user:{id}` (CLAUDE.md §2 rule 3). Only the ledger service writes it.

    `locked` is informational: coins the user has in pending withdrawals (held in escrow, so they
    are already out of `balance`).
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.PROTECT)
    balance = models.BigIntegerField(default=0)
    locked = models.BigIntegerField(default=0)
    version = models.BigIntegerField(default=0)

    class Meta:
        db_table = "wallet"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(condition=models.Q(balance__gte=0), name="wallet_balance_non_negative"),
            models.CheckConstraint(condition=models.Q(locked__gte=0), name="wallet_locked_non_negative"),
        ]

    def __str__(self) -> str:
        return f"wallet:{self.user_id}"


class BankAccount(models.Model):
    """Exactly one Sheba per user (CLAUDE.md §7.12). Accepted as declared; validated as an IBAN."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bank_account"
    )
    iban = models.CharField(max_length=26)
    bank_code = models.CharField(max_length=3)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bank_account"

    def __str__(self) -> str:
        return f"bank_account:{self.user_id}"


class WithdrawalRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"
        REJECTED = "rejected"
        CANCELLED = "cancelled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="withdrawals")
    coins = models.BigIntegerField()
    fee_coins = models.BigIntegerField(default=0)
    # Rial is fixed at request time from coin.price_toman (CLAUDE.md §2 rule 4, §7.12).
    price_toman = models.BigIntegerField()
    payout_rial = models.BigIntegerField()
    iban = models.CharField(max_length=26)
    bank_code = models.CharField(max_length=3)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    expected_by = models.DateField()
    idempotency_key = models.CharField(max_length=128)
    decided_by = models.ForeignKey(
        "adminapi.AdminUser",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="withdrawal_decisions",
    )
    # A finance admin claims a request before making the bank transfer, so two admins never both pay it.
    claimed_by = models.ForeignKey(
        "adminapi.AdminUser",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="withdrawal_claims",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    bank_reference = models.CharField(max_length=64, blank=True, default="")
    reject_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "withdrawal_request"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["user", "idempotency_key"], name="withdrawal_idem_unique"),
            models.CheckConstraint(condition=models.Q(coins__gt=0), name="withdrawal_coins_positive"),
        ]

    def __str__(self) -> str:
        return f"withdrawal:{self.pk}"


class TxType(models.TextChoices):
    PURCHASE = "purchase"
    MATCH_ENTRY = "match_entry"
    MATCH_PAYOUT = "match_payout"
    MATCH_REFUND = "match_refund"
    RAKE = "rake"
    REFERRAL_COMMISSION = "referral_commission"
    PREDICTION_STAKE = "prediction_stake"
    PREDICTION_PAYOUT = "prediction_payout"
    PREDICTION_REFUND = "prediction_refund"
    TOURNAMENT_ENTRY = "tournament_entry"
    TOURNAMENT_PRIZE = "tournament_prize"
    TOURNAMENT_REFUND = "tournament_refund"
    SIGNUP_BONUS = "signup_bonus"
    LEVEL_REWARD = "level_reward"
    ACHIEVEMENT_REWARD = "achievement_reward"
    SHOP_PURCHASE = "shop_purchase"
    USERNAME_CHANGE = "username_change"
    ADMIN_ADJUSTMENT = "admin_adjustment"
    ADMIN_TOPUP = "admin_topup"
    WITHDRAWAL_HOLD = "withdrawal_hold"
    WITHDRAWAL_PAYOUT = "withdrawal_payout"
    WITHDRAWAL_REFUND = "withdrawal_refund"
    TRANSFER = "transfer"


class LedgerEntry(models.Model):
    """Append-only double-entry ledger (CLAUDE.md §7.1, §15).

    Rows sharing a `tx_id` sum to zero; a deferred constraint trigger enforces it at commit, and
    another trigger rejects UPDATE and DELETE (migration 0002).
    """

    id = models.BigAutoField(primary_key=True)
    tx_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    account = models.CharField(max_length=64)
    amount = models.BigIntegerField()
    type = models.CharField(max_length=32, choices=TxType.choices)
    ref_type = models.CharField(max_length=32, blank=True, default="")
    ref_id = models.CharField(max_length=64, blank=True, default="")
    idempotency_key = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ledger_entry"
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["account", "created_at"]),
            models.Index(fields=["idempotency_key"]),
            models.Index(fields=["type", "created_at"]),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # One key per transaction: a replay can never add a second transaction for it.
            models.UniqueConstraint(fields=["idempotency_key", "account"], name="ledger_idem_account_unique"),
            models.CheckConstraint(condition=~models.Q(amount=0), name="ledger_amount_non_zero"),
        ]

    def __str__(self) -> str:
        return f"{self.tx_id}:{self.account}:{self.amount}"
