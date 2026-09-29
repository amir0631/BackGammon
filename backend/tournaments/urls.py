from django.urls import path

from tournaments import views

urlpatterns = [
    path("tournaments", views.TournamentsView.as_view()),
    path("tournaments/<int:tournament_id>", views.TournamentDetailView.as_view()),
    path("tournaments/<int:tournament_id>/join", views.JoinView.as_view()),
    path("tournaments/<int:tournament_id>/bracket", views.BracketView.as_view()),
]
