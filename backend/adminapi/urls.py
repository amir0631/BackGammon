from django.urls import path

from adminapi import views, wallet_views

urlpatterns = [
    path("auth/login", views.LoginView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
    path("settings", views.SettingsView.as_view()),
    path("settings/<str:key>", views.SettingDetailView.as_view()),
    path("sms/status", views.SmsStatusView.as_view()),
    path("sms/patterns/<str:code>", views.SmsPatternView.as_view()),
    path("audit", views.AuditView.as_view()),
    path("users", wallet_views.UsersView.as_view()),
    path("users/<int:user_id>", wallet_views.UserDetailView.as_view()),
    path("users/<int:user_id>/ledger", wallet_views.UserLedgerView.as_view()),
    path("users/<int:user_id>/status", wallet_views.UserStatusView.as_view()),
    path("users/<int:user_id>/password", wallet_views.UserPasswordResetView.as_view()),
    path("users/<int:user_id>/wallet/topup", wallet_views.TopupView.as_view()),
    path("users/<int:user_id>/wallet/adjust", wallet_views.AdjustView.as_view()),
    path("withdrawals", wallet_views.WithdrawalsAdminView.as_view()),
    path("withdrawals/<int:withdrawal_id>", wallet_views.WithdrawalDetailAdminView.as_view()),
    path("withdrawals/<int:withdrawal_id>/claim", wallet_views.WithdrawalClaimView.as_view()),
    path("withdrawals/<int:withdrawal_id>/approve", wallet_views.WithdrawalApproveView.as_view()),
    path("withdrawals/<int:withdrawal_id>/reject", wallet_views.WithdrawalRejectView.as_view()),
]
