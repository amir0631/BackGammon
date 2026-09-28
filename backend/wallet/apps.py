from django.apps import AppConfig


class WalletConfig(AppConfig):
    name = "wallet"

    def ready(self) -> None:
        from wallet import signals  # noqa: F401  (connects the signup bonus receiver)
