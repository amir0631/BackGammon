from django.http import HttpRequest, JsonResponse
from django.urls import include, path

from config import views
from config.errors import error_body

urlpatterns = [
    path("api/v1/health", views.health, name="health"),
    path("api/v1/admin/", include("adminapi.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("wallet.urls")),
    path("api/v1/", include("game.urls")),
    path("api/v1/", include("ranking.urls")),
    path("api/v1/", include("payments.urls")),
    path("api/v1/", include("shop.urls")),
    path("api/v1/", include("referrals.urls")),
    path("api/v1/", include("predictions.urls")),
]


def not_found(request: HttpRequest, exception: Exception) -> JsonResponse:
    return JsonResponse(error_body("NOT_FOUND", "errors.notFound"), status=404)


def server_error(request: HttpRequest) -> JsonResponse:
    return JsonResponse(error_body("SERVER_ERROR", "errors.generic"), status=500)


handler404 = not_found
handler500 = server_error
