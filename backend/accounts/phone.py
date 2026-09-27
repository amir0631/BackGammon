import re

from accounts.errors import PhoneInvalid

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_IR_MOBILE = re.compile(r"\+989\d{9}")


def normalize_phone(raw: str) -> str:
    """Iranian mobile numbers in any common form (09…, 9…, 989…, +989…, 00989…, Persian digits) → +989…"""
    value = re.sub(r"[\s\-()]", "", str(raw).translate(_DIGITS))
    if value.startswith("00"):
        value = "+" + value[2:]
    elif value.startswith("0"):
        value = "+98" + value[1:]
    elif value.startswith("98"):
        value = "+" + value
    elif value.startswith("9"):
        value = "+98" + value
    if not _IR_MOBILE.fullmatch(value):
        raise PhoneInvalid()
    return value


def mask_phone(phone: str) -> str:
    """For logs only: +98912***0000."""
    return f"{phone[:6]}***{phone[-4:]}" if len(phone) > 10 else "***"
