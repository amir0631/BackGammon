"""Shop and content administration (CLAUDE.md §13 Shop, Content, Predictions): coin packages, items
(themes, avatars, emoji and phrase packs) with prices and unlock levels, preset phrases, announcements
and banners, catalog text overrides, and held prediction pools. Every write is audited."""

from typing import Any, ClassVar

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from adminapi import audit
from adminapi.models import AdminUser
from adminapi.views import AdminView
from payments.models import CoinPackage
from predictions.models import PredictionPool
from shop.models import Announcement, Item, Phrase, TextOverride

Role = AdminUser.Role
PRICING = (Role.SUPERADMIN, Role.FINANCE)
EDITORS = (Role.SUPERADMIN, Role.SUPPORT)
LANGS = ("fa", "en")


def bilingual(value: Any) -> None:
    """Translatable admin content is {"fa": "...", "en": "..."} (§15), both filled."""
    if not isinstance(value, dict) or set(value) != set(LANGS):
        raise serializers.ValidationError("fa_and_en_required")
    if not all(isinstance(v, str) and v.strip() and len(v) <= 2000 for v in value.values()):
        raise serializers.ValidationError("fa_and_en_required")


class CoinPackageSerializer(serializers.ModelSerializer[CoinPackage]):
    name_i18n = serializers.JSONField(validators=[bilingual])
    coins = serializers.IntegerField(min_value=1, max_value=10_000_000)

    class Meta:
        model = CoinPackage
        fields: ClassVar[list[str]] = ["id", "coins", "name_i18n", "active", "sort"]


class ItemSerializer(serializers.ModelSerializer[Item]):
    name_i18n = serializers.JSONField(validators=[bilingual])
    price_coins = serializers.IntegerField(min_value=0)
    unlock_level = serializers.IntegerField(min_value=1, max_value=1000, required=False)

    class Meta:
        model = Item
        fields: ClassVar[list[str]] = [
            "id",
            "kind",
            "key",
            "name_i18n",
            "unlock",
            "price_coins",
            "unlock_level",
            "data",
            "active",
            "sort",
            "is_default",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        unlock = attrs.get("unlock", getattr(self.instance, "unlock", Item.Unlock.FREE))
        price = attrs.get("price_coins", getattr(self.instance, "price_coins", 0))
        if unlock == Item.Unlock.PURCHASABLE and price <= 0:
            raise serializers.ValidationError({"price_coins": "positive_price_required"})
        return attrs


class PhraseSerializer(serializers.ModelSerializer[Phrase]):
    text_i18n = serializers.JSONField(validators=[bilingual])
    key = serializers.RegexField(r"^[a-z][a-z0-9_]{1,39}$")

    class Meta:
        model = Phrase
        fields: ClassVar[list[str]] = ["id", "key", "text_i18n", "active"]


class AnnouncementSerializer(serializers.ModelSerializer[Announcement]):
    title_i18n = serializers.JSONField(validators=[bilingual])
    body_i18n = serializers.JSONField(validators=[bilingual])
    link = serializers.RegexField(r"^(/[A-Za-z0-9_\-/?=&]*)?$", required=False, allow_blank=True)

    class Meta:
        model = Announcement
        fields: ClassVar[list[str]] = [
            "id",
            "kind",
            "title_i18n",
            "body_i18n",
            "link",
            "active",
            "starts_at",
            "ends_at",
            "sort",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "after_start_required"})
        return attrs


class TextOverrideSerializer(serializers.ModelSerializer[TextOverride]):
    key = serializers.RegexField(r"^[A-Za-z][A-Za-z0-9_.]{1,159}$")
    text_i18n = serializers.JSONField(validators=[bilingual])

    class Meta:
        model = TextOverride
        fields: ClassVar[list[str]] = ["id", "key", "text_i18n", "updated_at"]


class _Crud(AdminView):
    """List and create (collection) or read, update, and delete (one row) for a model. Reads are open
    to every admin role; writes to `write_roles`."""

    serializer: ClassVar[type[serializers.ModelSerializer[Any]]]
    write_roles: ClassVar[tuple[str, ...]]
    target: ClassVar[str]
    deletable: ClassVar[bool] = False  # items and packages are deactivated, never deleted

    def get_permissions(self) -> Any:
        self.admin_roles = () if self.request.method == "GET" else self.write_roles
        return super().get_permissions()

    def _model(self) -> Any:
        return self.serializer.Meta.model

    def _row(self, pk: int) -> Any:
        row = self._model().objects.select_for_update().filter(pk=pk).first()
        if row is None:
            raise NotFound()
        return row


class CrudList(_Crud):
    def get(self, request: Request) -> Response:
        rows = self._model().objects.all()
        return Response({"results": self.serializer(rows, many=True).data, "next": None})

    def post(self, request: Request) -> Response:
        s = self.serializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            row = s.save()
            audit.record(request, f"{self.target}.create", self.target, str(row.pk), None, s.data)
        return Response(s.data, status=201)


class CrudDetail(_Crud):
    def get(self, request: Request, pk: int) -> Response:
        row = self._model().objects.filter(pk=pk).first()
        if row is None:
            raise NotFound()
        return Response(self.serializer(row).data)

    def patch(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            row = self._row(pk)
            before = self.serializer(row).data
            s = self.serializer(row, data=request.data, partial=True)
            s.is_valid(raise_exception=True)
            s.save()
            audit.record(request, f"{self.target}.update", self.target, str(pk), before, s.data)
        return Response(s.data)

    def delete(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            row = self._row(pk)
            before = self.serializer(row).data
            if self.deletable:
                row.delete()
                after = None
            else:
                row.active = False
                row.save(update_fields=["active"])
                after = self.serializer(row).data
            audit.record(request, f"{self.target}.delete", self.target, str(pk), before, after)
        return Response(status=204)


def crud(
    serializer: type[serializers.ModelSerializer[Any]], target: str, roles: tuple[str, ...], deletable: bool
) -> tuple[Any, Any]:
    attrs = {"serializer": serializer, "target": target, "write_roles": roles, "deletable": deletable}
    listing: Any = type(f"{target}List", (CrudList,), attrs)
    detail: Any = type(f"{target}Detail", (CrudDetail,), attrs)
    return listing.as_view(), detail.as_view()


packages = crud(CoinPackageSerializer, "coin_package", PRICING, deletable=False)
items = crud(ItemSerializer, "item", PRICING, deletable=False)
phrases = crud(PhraseSerializer, "phrase", EDITORS, deletable=False)
announcements = crud(AnnouncementSerializer, "announcement", EDITORS, deletable=True)
texts = crud(TextOverrideSerializer, "text_override", EDITORS, deletable=True)


# ---- predictions (§13: held pools) ----


def pool_payload(pool: PredictionPool) -> dict[str, Any]:
    m = pool.match
    return {
        "id": pool.id,
        "match_id": str(pool.match_id),
        "players": [
            m.player_a.username if m.player_a else None,
            m.player_b.username if m.player_b else None,
        ],
        "status": pool.status,
        "total_a": pool.total_a,
        "total_b": pool.total_b,
        "rake_pct": pool.rake_pct,
        "winner_side": pool.winner_side,
        "hold_reason": pool.hold_reason or None,
        "opened_at": pool.opened_at.isoformat(),
        "settled_at": pool.settled_at.isoformat() if pool.settled_at else None,
    }


class PoolsView(AdminView):
    """?status=held (default) | open | closed | settled | refunded; newest first, 100 at most."""

    def get(self, request: Request) -> Response:
        status = request.query_params.get("status") or PredictionPool.Status.HELD
        rows = (
            PredictionPool.objects.filter(status=status)
            .select_related("match__player_a", "match__player_b")
            .order_by("-id")[:100]
        )
        return Response({"results": [pool_payload(p) for p in rows], "next": None})


class PoolDecisionSerializer(serializers.Serializer[Any]):
    approve = serializers.BooleanField()
    reason = serializers.CharField(min_length=3, max_length=1000)


class PoolDecideView(AdminView):
    """Settle a held pool with the recorded result (approve) or refund every stake."""

    admin_roles = (Role.SUPERADMIN, Role.SUPPORT)

    def post(self, request: Request, pool_id: int) -> Response:
        from predictions.services import release_hold

        s = PoolDecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            pool = PredictionPool.objects.select_related("match__player_a", "match__player_b").filter(
                pk=pool_id
            )
            row = pool.first()
            if row is None:
                raise NotFound()
            before = pool_payload(row)
            release_hold(row.pk, approve=s.validated_data["approve"])
            row.refresh_from_db()
            after = pool_payload(row)
            audit.record(
                request, "prediction_pool.decide", "prediction_pool", str(row.pk), before, after,
                s.validated_data["reason"],
            )  # fmt: skip
        return Response(after)
