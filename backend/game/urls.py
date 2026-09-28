from django.urls import path

from game import views

urlpatterns = [
    path("tiers", views.TiersView.as_view()),
    path("matches/bot", views.BotMatchView.as_view()),
    path("matches/live", views.LiveMatchesView.as_view()),
    path("matches/<str:match_id>", views.MatchDetailView.as_view()),
    path("matches/<str:match_id>/replay", views.MatchReplayView.as_view()),
    path("me/matches", views.MyMatchesView.as_view()),
    path("me/matches/active", views.ActiveMatchView.as_view()),
]
