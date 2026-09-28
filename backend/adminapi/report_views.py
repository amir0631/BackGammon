"""Dashboard, reports, and match search (CLAUDE.md §13 Dashboard, Financial reports, Game analytics,
User analytics, Live and replays). Reports take ?from=&to= (ISO dates, Tehran days; the panel converts
Jalali input) and ?export=csv."""

import csv
from datetime import date, timedelta
from typing import Any

from django.db.models import Q
from django.http import HttpResponse
from rest_framework.request import Request
from rest_framework.response import Response

from adminapi.models import AdminUser
from adminapi.views import AdminView
from config.errors import AppError
from game.models import Match
from reports import services
from reports.activity import today

MONEY_ROLES = (AdminUser.Role.SUPERADMIN, AdminUser.Role.FINANCE)
DEFAULT_DAYS = 30
PAGE = 50


class BadRange(AppError):
    status_code = 400
    code = "REPORT_RANGE_INVALID"
    message_key = "errors.admin.reportRange"


def date_range(request: Request) -> tuple[date, date]:
    p = request.query_params
    try:
        last = date.fromisoformat(p["to"]) if p.get("to") else today()
        first = date.fromisoformat(p["from"]) if p.get("from") else last - timedelta(days=DEFAULT_DAYS - 1)
    except ValueError as exc:
        raise BadRange(details={"reason": "format"}) from exc
    if first > last or (last - first).days >= services.MAX_DAYS:
        raise BadRange(details={"reason": "span", "max_days": services.MAX_DAYS})
    return first, last


def csv_response(name: str, rows: list[dict[str, Any]]) -> HttpResponse:
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{name}.csv"'
    response.write("﻿")  # Excel opens UTF-8 correctly with a BOM
    if rows:
        writer = csv.DictWriter(response, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return response


class _Report(AdminView):
    name = ""

    def build(self, first: date, last: date) -> dict[str, Any]:
        raise NotImplementedError

    def get(self, request: Request) -> Response | HttpResponse:
        first, last = date_range(request)
        data = self.build(first, last)
        if request.query_params.get("export") == "csv":
            return csv_response(f"{self.name}-{first}-{last}", data["rows"])
        return Response({"from": first.isoformat(), "to": last.isoformat(), **data})


class FinancialReportView(_Report):
    admin_roles = MONEY_ROLES
    name = "financial"

    def build(self, first: date, last: date) -> dict[str, Any]:
        return services.financial(first, last)


class GameReportView(_Report):
    name = "games"

    def build(self, first: date, last: date) -> dict[str, Any]:
        return services.games(first, last)


class UserReportView(_Report):
    name = "users"

    def build(self, first: date, last: date) -> dict[str, Any]:
        return services.users(first, last)


class DashboardView(AdminView):
    def get(self, request: Request) -> Response:
        return Response(services.dashboard())


class DiceTestRunView(AdminView):
    """Run the §6.5 dice test now over the last 7 days (the weekly job does the same)."""

    admin_roles = (AdminUser.Role.SUPERADMIN,)

    def post(self, request: Request) -> Response:
        from django.utils import timezone

        from reports import dice

        end = timezone.now()
        return Response(services.dice_test_payload(dice.run(end - timedelta(days=7), end)))


def match_row(m: Match) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "variant": m.variant,
        "length": m.length,
        "entry": m.entry,
        "status": m.status,
        "players": [
            {"id": m.player_a_id, "username": m.player_a.username if m.player_a else None},
            {"id": m.player_b_id, "username": m.player_b.username if m.player_b else None},
        ],
        "is_bot": m.is_bot,
        "bot_level": m.bot_level or None,
        "score": [m.score_a, m.score_b],
        "winner_side": m.winner_side,
        "end_reason": m.end_reason or None,
        "tournament_id": m.tournament_id,
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
    }


class MatchSearchView(AdminView):
    """Past and live matches (§13 Live and replays): ?q= match id or username, ?user_id=, ?status=,
    ?from=&to= (start date), ?cursor=; newest first."""

    def get(self, request: Request) -> Response:
        p = request.query_params
        qs = Match.objects.select_related("player_a", "player_b").order_by("-created_at", "-id")
        if q := (p.get("q") or "").strip():
            by_name = Q(player_a__username__iexact=q) | Q(player_b__username__iexact=q)
            qs = qs.filter(by_name | Q(id=q)) if _is_uuid(q) else qs.filter(by_name)
        if (user_id := p.get("user_id") or "").isdigit():
            qs = qs.filter(Q(player_a_id=int(user_id)) | Q(player_b_id=int(user_id)))
        if status := p.get("status"):
            qs = qs.filter(status=status)
        if p.get("from") or p.get("to"):
            first, last = date_range(request)
            start, end = services.bounds(first, last)
            qs = qs.filter(created_at__gte=start, created_at__lt=end)
        if cursor := p.get("cursor"):
            anchor = Match.objects.filter(pk=cursor).values_list("created_at", flat=True).first()
            if anchor is not None:
                qs = qs.filter(Q(created_at__lt=anchor) | Q(created_at=anchor, id__lt=cursor))
        rows = list(qs[: PAGE + 1])
        page, more = rows[:PAGE], len(rows) > PAGE
        return Response({"results": [match_row(m) for m in page], "next": str(page[-1].id) if more else None})


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


class LiveMatchesAdminView(AdminView):
    """The same list players see (§20.4), for the admin's live section."""

    def get(self, request: Request) -> Response:
        from game.views import live_rows

        return Response({"results": live_rows(request.query_params), "next": None})


class AdminWsTokenView(AdminView):
    """A token for the admin's WebSocket, which may only watch matches, hidden from players (§13)."""

    def get(self, request: Request) -> Response:
        from adminapi.auth import ADMIN_WS_TTL_SECONDS, ws_token
        from adminapi.models import AdminSession

        session = request.auth
        assert isinstance(session, AdminSession)
        return Response({"token": ws_token(session), "expires_in": ADMIN_WS_TTL_SECONDS})
