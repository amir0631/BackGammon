from django.urls import path

from shop import views

urlpatterns = [
    path("shop/items", views.ItemsView.as_view()),
    path("shop/items/<int:item_id>/buy", views.BuyView.as_view()),
    path("me/items/<int:item_id>/equip", views.EquipView.as_view()),
    path("me/username", views.UsernameView.as_view()),
    path("themes", views.ThemesView.as_view()),
    path("phrases", views.PhrasesView.as_view()),
    path("announcements", views.AnnouncementsView.as_view()),
    path("content/texts", views.TextsView.as_view()),
]
