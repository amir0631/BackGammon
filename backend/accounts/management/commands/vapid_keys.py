from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand

from accounts.push import b64u


class Command(BaseCommand):
    help = "Generate a VAPID key pair for Web Push (put the private key in VAPID_PRIVATE_KEY)."

    def handle(self, *args: Any, **options: Any) -> None:
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(32, "big")
        public = key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64u(private)}")
        self.stdout.write(f"public key (served by GET push/key): {b64u(public)}")
