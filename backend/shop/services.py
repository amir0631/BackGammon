"""Catalog, purchase, equip, and the reaction keys a player may send (CLAUDE.md §1, §11.2, §12.1)."""

from datetime import timedelta
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.functions import Lower
from django.utils import timezone

from accounts import errors as auth_errors
from accounts.models import User
from accounts.validators import validate_username
from config.errors import AppError
from settingsapp import registry
from shop.models import Item, UserItem
from wallet import errors as wallet_errors
from wallet import ledger
from wallet.models import TxType

EQUIPPABLE = (Item.Kind.BOARD_THEME, Item.Kind.CHECKER_THEME, Item.Kind.AVATAR)


class ItemUnavailable(AppError):
    status_code = 404
    code = "ITEM_UNAVAILABLE"
    message_key = "errors.shop.itemUnavailable"


class ItemNotOwned(AppError):
    status_code = 403
    code = "ITEM_NOT_OWNED"
    message_key = "errors.shop.itemNotOwned"


class PriceChanged(AppError):
    status_code = 409
    code = "SHOP_PRICE_CHANGED"
    message_key = "errors.shop.priceChanged"


class ItemNotForSale(AppError):
    status_code = 409
    code = "ITEM_NOT_FOR_SALE"
    message_key = "errors.shop.itemNotForSale"


class UsernameCooldown(AppError):
    status_code = 409
    code = "USERNAME_COOLDOWN"
    message_key = "errors.profile.usernameCooldown"


def _owned_ids(user: User) -> set[int]:
    return set(UserItem.objects.filter(user=user).values_list("item_id", flat=True))


def owns(user: User, item: Item, owned: set[int] | None = None) -> bool:
    if item.unlock == Item.Unlock.FREE:
        return True
    if item.unlock == Item.Unlock.LEVEL_LOCKED:
        return user.level >= item.unlock_level or item.id in (
            owned if owned is not None else _owned_ids(user)
        )
    return item.id in (owned if owned is not None else _owned_ids(user))


def equipped(user: User) -> dict[str, str]:
    """Keys of the equipped board and checker themes (defaults when nothing is chosen)."""
    chosen = dict(user.equipped or {})
    out = {}
    for kind in (Item.Kind.BOARD_THEME, Item.Kind.CHECKER_THEME):
        key = chosen.get(kind)
        if not key:
            default = Item.objects.filter(kind=kind, is_default=True, active=True).first()
            key = default.key if default else ""
        out[str(kind)] = key
    return out


def item_payload(item: Item, user: User | None, owned: set[int], equip: dict[str, str]) -> dict[str, Any]:
    has = user is not None and owns(user, item, owned)
    locked = item.unlock == Item.Unlock.LEVEL_LOCKED and not has
    if item.kind == Item.Kind.AVATAR:
        is_equipped = user is not None and user.avatar == item.key
    else:
        is_equipped = equip.get(str(item.kind)) == item.key
    return {
        "id": item.id,
        "kind": item.kind,
        "key": item.key,
        "name": item.name_i18n,
        "unlock": item.unlock,
        "price": item.price_coins if item.unlock == Item.Unlock.PURCHASABLE else 0,
        "unlock_level": item.unlock_level if item.unlock == Item.Unlock.LEVEL_LOCKED else None,
        "owned": has,
        "locked": locked,
        "equipped": is_equipped,
        "data": item.data,
    }


def catalog(user: User | None, kind: str | None = None) -> list[dict[str, Any]]:
    items = Item.objects.filter(active=True)
    if kind:
        items = items.filter(kind=kind)
    owned = _owned_ids(user) if user else set()
    equip = equipped(user) if user else {}
    return [item_payload(i, user, owned, equip) for i in items]


def buy(user: User, item_id: int, expected_price: int | None = None) -> dict[str, Any]:
    """`expected_price`: the price the player confirmed; a different current price is refused with
    PRICE_CHANGED instead of charged (§21.2: the cost shown is the cost paid)."""
    if user.status == User.Status.SUSPENDED:
        raise wallet_errors.AccountSuspended()
    with transaction.atomic():
        item = Item.objects.select_for_update().filter(id=item_id, active=True).first()
        if item is None:
            raise ItemUnavailable()
        if item.unlock != Item.Unlock.PURCHASABLE:
            raise ItemNotForSale(details={"unlock": item.unlock})
        owned = UserItem.objects.filter(user=user, item=item).exists()
        if not owned and expected_price is not None and expected_price != item.price_coins:
            raise PriceChanged(details={"price": item.price_coins})
        if not owned:
            ledger.ensure_wallet(user.id)
            # Keyed per player and item: an item is bought at most once, whatever the retries.
            ledger.post(
                TxType.SHOP_PURCHASE,
                [
                    (ledger.user_account(user.id), -item.price_coins),
                    (ledger.PLATFORM_SINKS, item.price_coins),
                ],
                idempotency_key=f"shop:{user.id}:{item.id}",
                ref_type="item",
                ref_id=item.id,
            )
            UserItem.objects.create(user=user, item=item, source=UserItem.Source.PURCHASE)
    return item_payload(item, user, _owned_ids(user), equipped(user))


def equip(user: User, item_id: int) -> dict[str, Any]:
    item = Item.objects.filter(id=item_id, active=True, kind__in=EQUIPPABLE).first()
    if item is None:
        raise ItemUnavailable()
    if not owns(user, item):
        raise ItemNotOwned(details={"unlock": item.unlock, "unlock_level": item.unlock_level})
    if item.kind == Item.Kind.AVATAR:
        user.avatar = item.key
        user.save(update_fields=["avatar"])
    else:
        user.equipped = {**(user.equipped or {}), str(item.kind): item.key}
        user.save(update_fields=["equipped"])
    return item_payload(item, user, _owned_ids(user), equipped(user))


def reaction_keys(user_id: int) -> dict[str, set[str]]:
    """Emoji and phrase keys the player may send: every free pack, level packs reached, bought packs."""
    user = User.objects.get(pk=user_id)
    owned = _owned_ids(user)
    out: dict[str, set[str]] = {"emoji": set(), "phrase": set()}
    for item in Item.objects.filter(active=True, kind__in=[Item.Kind.EMOJI_PACK, Item.Kind.PHRASE_PACK]):
        if owns(user, item, owned):
            out["emoji" if item.kind == Item.Kind.EMOJI_PACK else "phrase"] |= set(item.data.get("keys", []))
    return out


def change_username(user: User, new: str) -> User:
    """§12.1: costs username.change_cost coins, at most once per username.change_cooldown_days."""
    if user.status == User.Status.SUSPENDED:
        raise wallet_errors.AccountSuspended()
    username = validate_username(new.strip())
    if user.username and user.username.lower() == username.lower() and user.username == username:
        return user
    cooldown = registry.get("username.change_cooldown_days")
    if User.objects.annotate(u=Lower("username")).filter(u=username.lower()).exclude(pk=user.pk).exists():
        raise auth_errors.UsernameTaken()
    cost = registry.get("username.change_cost")
    try:
        with transaction.atomic():
            # Checked on the locked row, so two quick changes cannot both pass the cooldown.
            locked = User.objects.select_for_update().get(pk=user.pk)
            changed = locked.username_changed_at
            if changed and timezone.now() - changed < timedelta(days=cooldown):
                available = changed + timedelta(days=cooldown)
                raise UsernameCooldown(details={"available_at": available.isoformat()})
            if cost:
                ledger.ensure_wallet(user.id)
                ledger.post(
                    TxType.USERNAME_CHANGE,
                    [(ledger.user_account(user.id), -cost), (ledger.PLATFORM_SINKS, cost)],
                    idempotency_key=f"username:{user.id}:{locked.username_changed_at or 'first'}",
                    ref_type="user",
                    ref_id=user.id,
                )
            locked.username = username
            locked.username_changed_at = timezone.now()
            locked.save(update_fields=["username", "username_changed_at"])
    except IntegrityError:
        raise auth_errors.UsernameTaken() from None
    return locked
