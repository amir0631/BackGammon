from django.urls import path

from wallet import views

urlpatterns = [
    path("wallet", views.WalletView.as_view()),
    path("wallet/ledger", views.LedgerView.as_view()),
    path("wallet/banks", views.BanksView.as_view()),
    path("wallet/transfer", views.TransferView.as_view()),
    path("wallet/withdrawals", views.WithdrawalsView.as_view()),
    path("wallet/withdrawals/otp", views.WithdrawalOtpView.as_view()),
    path("wallet/withdrawals/<int:withdrawal_id>", views.WithdrawalDetailView.as_view()),
    path("me/bank-accounts", views.BankAccountsView.as_view()),
    path("me/bank-accounts/<int:account_id>", views.BankAccountDetailView.as_view()),
]
