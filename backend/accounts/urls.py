from django.urls import path

from accounts import views

urlpatterns = [
    path("auth/csrf", views.CsrfView.as_view()),
    path("auth/otp", views.OtpRequestView.as_view()),
    path("auth/otp/verify", views.OtpVerifyView.as_view()),
    path("auth/register", views.RegisterView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/refresh", views.RefreshView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("auth/password/reset", views.PasswordResetView.as_view()),
    path("me", views.MeView.as_view()),
    path("me/sessions", views.SessionsView.as_view()),
    path("users/<str:username>", views.UserProfileView.as_view()),
    path("avatars", views.AvatarsView.as_view()),
]
