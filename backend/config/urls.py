from django.http import HttpRequest, JsonResponse
from django.urls import path

from config import views
from config.errors import error_body

urlpatterns = [
    path("api/v1/health", views.health, name="health"),
]


def not_found(request: HttpRequest, exception: Exception) -> JsonResponse:
    return JsonResponse(error_body("NOT_FOUND", "errors.notFound"), status=404)


def server_error(request: HttpRequest) -> JsonResponse:
    return JsonResponse(error_body("SERVER_ERROR", "errors.generic"), status=500)


handler404 = not_found
handler500 = server_error
