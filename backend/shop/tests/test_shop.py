import pytest
from rest_framework.test import APIClient

from game.services import create_match, player_info
from realtime import live
from shop.models import Item
from wallet import invariants
from wallet.ledger import PLATFORM_SINKS
from wallet.models import LedgerEntry, Wallet
from wallet.tests.helpers import fund, make_user


def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def item(kind, key):
    return Item.objects.get(kind=kind, key=key)


def buy(c, item_id, key="b1"):
    return c.post(f"/api/v1/shop/items/{item_id}/buy", HTTP_IDEMPOTENCY_KEY=key)


@pytest.mark.django_db
class TestShop:
    def test_catalog_states(self):
        user = make_user()
        rows = {(r["kind"], r["key"]): r for r in client(user).get("/api/v1/shop/items").json()["results"]}
        walnut, ebony, khatam = (
            rows[("board_theme", "walnut")],
            rows[("board_theme", "ebony")],
            rows[("board_theme", "khatam")],
        )
        assert walnut["owned"] and walnut["equipped"] and not walnut["locked"]
        assert ebony["locked"] and ebony["unlock_level"] == 5 and not ebony["owned"]
        assert khatam["price"] == 300 and not khatam["owned"]
        assert len([r for r in rows.values() if r["kind"] == "avatar"]) == 12

    def test_buy_once_and_equip(self):
        user = make_user()
        fund(user, 400)
        c = client(user)
        khatam = item("board_theme", "khatam")
        assert c.post(f"/api/v1/me/items/{khatam.id}/equip").json()["code"] == "ITEM_NOT_OWNED"
        res = buy(c, khatam.id)
        assert res.status_code == 200 and res.json()["owned"]
        assert buy(c, khatam.id, "b2").json()["owned"]  # a second buy charges nothing
        assert Wallet.objects.get(user=user).balance == 100
        assert LedgerEntry.objects.get(account=PLATFORM_SINKS).amount == 300
        assert c.post(f"/api/v1/me/items/{khatam.id}/equip").json()["equipped"]
        themes = c.get("/api/v1/themes").json()
        assert themes["equipped"] == {"board_theme": "khatam", "checker_theme": "classic"}
        assert buy(c, item("board_theme", "marble").id, "b3").json()["code"] == "WALLET_INSUFFICIENT"
        assert invariants.check() == []

    def test_level_locked_and_free_items_are_not_sold(self):
        user = make_user()
        fund(user, 1000)
        c = client(user)
        ebony = item("board_theme", "ebony")
        assert buy(c, ebony.id).json()["code"] == "ITEM_NOT_FOR_SALE"
        assert buy(c, item("board_theme", "walnut").id).json()["code"] == "ITEM_NOT_FOR_SALE"
        user.level = 5
        user.save()
        assert c.post(f"/api/v1/me/items/{ebony.id}/equip").json()["equipped"]

    def test_suspended_cannot_spend(self):
        user = make_user(status="suspended")
        fund(user, 1000)
        assert buy(client(user), item("board_theme", "khatam").id).json()["code"] == "ACCOUNT_SUSPENDED"

    def test_avatar_equip_and_player_info_carries_themes(self):
        user = make_user()
        c = client(user)
        c.post(f"/api/v1/me/items/{item('avatar', 'avatar_07').id}/equip")
        user.refresh_from_db()
        info = player_info(user)
        assert (
            info["avatar"] == "avatar_07"
            and info["board_theme"] == "walnut"
            and info["checker_theme"] == "classic"
        )

    def test_price_change_after_confirming_is_refused(self):
        user = make_user()
        fund(user, 400)
        c = client(user)
        khatam = item("board_theme", "khatam")
        Item.objects.filter(pk=khatam.pk).update(price_coins=350)  # an admin changed it meanwhile
        res = c.post(
            f"/api/v1/shop/items/{khatam.id}/buy",
            {"expected_price": 300},
            format="json",
            HTTP_IDEMPOTENCY_KEY="p1",
        )
        assert res.status_code == 409 and res.json()["code"] == "SHOP_PRICE_CHANGED"
        assert res.json()["details"]["price"] == 350 and Wallet.objects.get(user=user).balance == 400
        ok = c.post(
            f"/api/v1/shop/items/{khatam.id}/buy",
            {"expected_price": 350},
            format="json",
            HTTP_IDEMPOTENCY_KEY="p2",
        )
        assert ok.json()["owned"] and Wallet.objects.get(user=user).balance == 50

    def test_owned_shop_avatar_can_be_chosen_in_profile(self):
        user = make_user()
        c = client(user)
        Item.objects.create(
            kind="avatar",
            key="shop_falcon",
            name_i18n={"fa": "x", "en": "x"},
            unlock="purchasable",
            price_coins=10,
        )
        assert c.patch("/api/v1/me", {"avatar": "shop_falcon"}, format="json").status_code == 400
        fund(user, 10)
        buy(c, item("avatar", "shop_falcon").id)
        assert (
            c.patch("/api/v1/me", {"avatar": "shop_falcon"}, format="json").json()["avatar"] == "shop_falcon"
        )

    def test_phrases(self):
        rows = {p["key"]: p["text"] for p in APIClient().get("/api/v1/phrases").json()["results"]}
        assert rows["good_game"] == {"fa": "بازی خوبی بود!", "en": "Good game!"}


@pytest.mark.django_db
def test_bought_emoji_pack_unlocks_reactions(clock, published, django_capture_on_commit_callbacks):
    a, b = make_user(), make_user()
    fund(a, 200)
    with django_capture_on_commit_callbacks(execute=True):
        mid = str(create_match(a, b, "standard_cube", 1).id)
    assert (
        live.handle(mid, a.id, "react.send", {"emoji_key": "trophy"}, 0)[0]["payload"]["details"]["reason"]
        == "unknown"
    )
    buy(client(a), item("emoji_pack", "celebrate").id)
    clock.t += 5
    assert live.handle(mid, a.id, "react.send", {"emoji_key": "trophy"}, 0) == []


@pytest.mark.django_db
class TestUsernameChange:
    def post(self, c, name, key):
        return c.post("/api/v1/me/username", {"username": name}, format="json", HTTP_IDEMPOTENCY_KEY=key)

    def test_costs_coins_and_has_a_cooldown(self):
        user = make_user("Old_Name")
        fund(user, 500)
        c = client(user)
        res = self.post(c, "New_Name", "u1")
        assert res.status_code == 200 and res.json()["username"] == "New_Name"
        assert Wallet.objects.get(user=user).balance == 300
        res = self.post(c, "Third_Name", "u2")
        assert res.json()["code"] == "USERNAME_COOLDOWN" and res.json()["details"]["available_at"]
        assert invariants.check() == []

    def test_taken_poor_and_suspended(self):
        make_user("Taken_1")
        user = make_user()
        c = client(user)
        assert self.post(c, "taken_1", "u1").json()["code"] == "USERNAME_TAKEN"
        assert self.post(c, "Fresh_1", "u2").json()["code"] == "WALLET_INSUFFICIENT"
        suspended = make_user(status="suspended")
        fund(suspended, 500)
        assert self.post(client(suspended), "Fresh_2", "u3").json()["code"] == "ACCOUNT_SUSPENDED"
