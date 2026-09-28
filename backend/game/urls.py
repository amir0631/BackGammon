from django.urls import path

from game import views

urlpatterns = [
    path("matches/bot", views.BotMatchView.as_view()),
    path("me/matches/active", views.ActiveMatchView.as_view()),
]
