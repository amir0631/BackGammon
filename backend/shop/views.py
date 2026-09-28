"""Shop and content API (CLAUDE.md §10.2 Shop, Content)."""

from typing import Any

from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.serializers import me_payload
from shop import services
from shop.models import Item, Phrase
from wallet.views import idempotency_key


def _user(request: Request) -> User | None:
    return request.user if isinstance(request.user, User) else None


class ItemsView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        kind = request.query_params.get("kind")
        return Response({"results": services.catalog(_user(request), kind), "next": None})


class BuyView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, item_id: int) -> Response:
        idempotency_key(request)  # coin-moving write (§10.1); the purchase itself is keyed per item
        user = _user(request)
        assert user is not None
        return Response(services.buy(user, item_id))


class EquipView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, item_id: int) -> Response:
        user = _user(request)
        assert user is not None
        return Response(services.equip(user, item_id))


class ThemesView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        user = _user(request)
        items = [
            *services.catalog(user, Item.Kind.BOARD_THEME),
            *services.catalog(user, Item.Kind.CHECKER_THEME),
        ]
        return Response(
            {"results": items, "equipped": services.equipped(user) if user else None, "next": None}
        )


class PhrasesView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        rows = Phrase.objects.filter(active=True).order_by("key")
        return Response({"results": [{"key": p.key, "text": p.text_i18n} for p in rows], "next": None})


class UsernameSerializer(serializers.Serializer[Any]):
    username = serializers.CharField(max_length=40)


class UsernameView(APIView):
    """Change username (§12.1): costs coins, once per cooldown."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        idempotency_key(request)
        s = UsernameSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = _user(request)
        assert user is not None
        return Response(me_payload(services.change_username(user, s.validated_data["username"])))
