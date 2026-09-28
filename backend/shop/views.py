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
from shop.models import Announcement, Item, Phrase, TextOverride
from wallet.views import idempotency_key


def _user(request: Request) -> User | None:
    return request.user if isinstance(request.user, User) else None


class ItemsView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        kind = request.query_params.get("kind")
        return Response({"results": services.catalog(_user(request), kind), "next": None})


class BuySerializer(serializers.Serializer[Any]):
    expected_price = serializers.IntegerField(min_value=0, required=False)


class BuyView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, item_id: int) -> Response:
        idempotency_key(request)  # coin-moving write (§10.1); the purchase itself is keyed per item
        user = _user(request)
        assert user is not None
        s = BuySerializer(data=request.data or {})
        s.is_valid(raise_exception=True)
        return Response(services.buy(user, item_id, s.validated_data.get("expected_price")))


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


class AnnouncementsView(APIView):
    """Announcements and banners currently showing (§13 Content)."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        from django.db.models import Q
        from django.utils import timezone

        now = timezone.now()
        rows = Announcement.objects.filter(active=True).filter(
            Q(starts_at__isnull=True) | Q(starts_at__lte=now), Q(ends_at__isnull=True) | Q(ends_at__gt=now)
        )
        return Response(
            {
                "results": [
                    {
                        "id": a.id,
                        "kind": a.kind,
                        "title": a.title_i18n,
                        "body": a.body_i18n,
                        "link": a.link,
                        "published_at": (a.starts_at or a.created_at).isoformat(),
                        "ends_at": a.ends_at.isoformat() if a.ends_at else None,
                    }
                    for a in rows
                ],
                "next": None,
            }
        )


class TextsView(APIView):
    """Admin overrides of catalog strings, per locale: {"fa": {key: text}, "en": {...}}."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        out: dict[str, dict[str, str]] = {"fa": {}, "en": {}}
        for key, text in TextOverride.objects.values_list("key", "text_i18n"):
            for lang in out:
                if value := (text or {}).get(lang):
                    out[lang][key] = value
        return Response(out)
