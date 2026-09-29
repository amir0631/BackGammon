from django.urls import path

from predictions import views

urlpatterns = [
    path("predictions/open", views.OpenPoolsView.as_view()),
    path("predictions", views.PredictionsView.as_view()),
    path("me/predictions", views.MyPredictionsView.as_view()),
]
