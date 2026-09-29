from django.urls import path

from ranking import views

urlpatterns = [path("leaderboard", views.LeaderboardView.as_view())]
