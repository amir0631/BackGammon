"""Shop coin purchase (CLAUDE.md §10.2 Shop: packages, checkout, payments/callback)."""

import html
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from payments import services
from payments.gateways.sandbox import SandboxGateway
from payments.models import Payment
from settingsapp import registry
from wallet.views import idempotency_key


def payment_payload(p: Payment) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "coins": p.coins,
        "amount_toman": p.amount_rial // 10,
        "status": p.status,
        "reference": p.reference or None,
        "card_mask": p.card_mask or None,
        "failure": p.failure or None,
        "created_at": p.created_at.isoformat(),
        "verified_at": p.verified_at.isoformat() if p.verified_at else None,
    }


class PackagesView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        return Response(
            {
                "enabled": registry.get("payments.enabled"),
                "price_toman": registry.get("coin.price_toman"),
                "custom_min_toman": registry.get("shop.custom_min_toman"),
                "custom_max_toman": registry.get("shop.custom_max_toman"),
                "results": services.packages(),
                "next": None,
            }
        )


class CheckoutSerializer(serializers.Serializer[Any]):
    package_id = serializers.IntegerField(required=False, allow_null=True)
    custom_toman = serializers.IntegerField(required=False, allow_null=True)
    surface = serializers.ChoiceField(choices=list(services.SURFACES), default="m")


class CheckoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        key = idempotency_key(request)
        s = CheckoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        d = s.validated_data
        payment = services.checkout(
            request.user, d.get("package_id"), d.get("custom_toman"), d["surface"], key
        )
        redirect_url = getattr(payment, "redirect_url", None)
        return Response(
            {**payment_payload(payment), "redirect_url": redirect_url}, status=status.HTTP_201_CREATED
        )


class PaymentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, payment_id: str) -> Response:
        assert isinstance(request.user, User)
        try:
            payment = Payment.objects.filter(id=payment_id, user=request.user).first()
        except DjangoValidationError:
            payment = None
        if payment is None:
            raise NotFound()
        return Response(payment_payload(payment))


def callback(request: HttpRequest) -> HttpResponse:
    """The gateway sends the user back here. Verify on the server, then show the result page of the
    surface that started the checkout."""
    authority = request.GET.get("authority") or request.POST.get("authority") or ""
    payment = services.handle_callback(authority) if authority else None
    surface = payment.surface if payment else "m"
    target = f"{settings.URL_SCHEME}://{surface}.{settings.BASE_DOMAIN}/shop/coins/result"
    if payment is not None:
        target += f"?payment={payment.id}"
    return HttpResponseRedirect(target)


def sandbox_page(request: HttpRequest, authority: str) -> HttpResponse:
    """A stand-in for the bank's page (sandbox gateway only; the real page belongs to the PSP)."""
    gateway = SandboxGateway()
    data = gateway.get(authority)
    if settings.PAYMENT_GATEWAY != "sandbox" or data is None:
        return HttpResponse(status=404)
    if request.method == "POST":
        gateway.decide(authority, paid=request.POST.get("action") == "pay")
        return HttpResponseRedirect(f"{data['callback']}?authority={authority}")
    amount = html.escape(f"{int(str(data['amount'])) // 10:,}")
    body = f"""<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:16px">
<h1>درگاه آزمایشی · Sandbox gateway</h1><p>{amount} تومان / toman</p>
<form method="post"><button name="action" value="pay" style="min-height:48px;width:100%">پرداخت · Pay</button>
<p></p><button name="action" value="cancel" style="min-height:48px;width:100%">انصراف · Cancel</button></form>
</body></html>"""
    return HttpResponse(body)
