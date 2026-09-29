from django.apps import AppConfig


class SettingsAppConfig(AppConfig):
    name = "settingsapp"

    def ready(self) -> None:
        from config import checks  # noqa: F401 - registers the production configuration check
