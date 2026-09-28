from django.urls import path

from referrals import views

urlpatterns = [
    path("me/referral", views.ReferralView.as_view()),
    path("me/referral/earnings", views.EarningsView.as_view()),
]
