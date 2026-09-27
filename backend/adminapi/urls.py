from django.urls import path

from adminapi import views

urlpatterns = [
    path("auth/login", views.LoginView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
    path("settings", views.SettingsView.as_view()),
    path("settings/<str:key>", views.SettingDetailView.as_view()),
    path("sms/status", views.SmsStatusView.as_view()),
    path("audit", views.AuditView.as_view()),
]
