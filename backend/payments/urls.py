from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from payments import views

urlpatterns = [
    path("shop/packages", views.PackagesView.as_view()),
    path("shop/checkout", views.CheckoutView.as_view()),
    path("payments/callback", csrf_exempt(views.callback)),
    path("payments/sandbox/<str:authority>", csrf_exempt(views.sandbox_page)),
    path("payments/<str:payment_id>", views.PaymentDetailView.as_view()),
]
