"""Iranian IBAN (Sheba) validation (CLAUDE.md §7.12): IR + 24 digits, ISO 13616 mod-97, known bank."""

import re

from config.errors import AppError

# Three-digit bank identifiers at positions 5-7 of an Iranian IBAN (after "IRkk").
BANKS: dict[str, tuple[str, str]] = {
    "010": ("بانک مرکزی", "Central Bank of Iran"),
    "011": ("بانک صنعت و معدن", "Bank of Industry and Mine"),
    "012": ("بانک ملت", "Bank Mellat"),
    "013": ("بانک رفاه کارگران", "Refah Bank"),
    "014": ("بانک مسکن", "Bank Maskan"),
    "015": ("بانک سپه", "Bank Sepah"),
    "016": ("بانک کشاورزی", "Bank Keshavarzi"),
    "017": ("بانک ملی ایران", "Bank Melli Iran"),
    "018": ("بانک تجارت", "Tejarat Bank"),
    "019": ("بانک صادرات ایران", "Bank Saderat Iran"),
    "020": ("بانک توسعه صادرات", "Export Development Bank"),
    "021": ("پست بانک", "Post Bank"),
    "022": ("بانک توسعه تعاون", "Tose'e Ta'avon Bank"),
    "051": ("مؤسسه اعتباری توسعه", "Tose'e Credit Institution"),
    "052": ("بانک قوامین", "Ghavamin Bank"),
    "053": ("بانک کارآفرین", "Karafarin Bank"),
    "054": ("بانک پارسیان", "Parsian Bank"),
    "055": ("بانک اقتصاد نوین", "Eghtesad Novin Bank"),
    "056": ("بانک سامان", "Saman Bank"),
    "057": ("بانک پاسارگاد", "Pasargad Bank"),
    "058": ("بانک سرمایه", "Sarmayeh Bank"),
    "059": ("بانک سینا", "Sina Bank"),
    "060": ("بانک قرض‌الحسنه مهر ایران", "Mehr Iran Bank"),
    "061": ("بانک شهر", "Shahr Bank"),
    "062": ("بانک آینده", "Ayandeh Bank"),
    "063": ("بانک انصار", "Ansar Bank"),
    "064": ("بانک گردشگری", "Tourism Bank"),
    "065": ("بانک حکمت ایرانیان", "Hekmat Iranian Bank"),
    "066": ("بانک دی", "Day Bank"),
    "069": ("بانک ایران زمین", "Iran Zamin Bank"),
    "070": ("بانک قرض‌الحسنه رسالت", "Resalat Bank"),
    "073": ("مؤسسه اعتباری کوثر", "Kosar Credit Institution"),
    "075": ("مؤسسه اعتباری ملل", "Melal Credit Institution"),
    "078": ("بانک خاورمیانه", "Middle East Bank"),
    "080": ("مؤسسه اعتباری نور", "Noor Credit Institution"),
    "090": ("بانک مهر اقتصاد", "Mehr Eqtesad Bank"),
    "095": ("بانک ایران و ونزوئلا", "Iran-Venezuela Bank"),
}

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


class IbanInvalid(AppError):
    code = "IBAN_INVALID"
    message_key = "errors.wallet.ibanInvalid"


def normalize_iban(raw: str) -> str:
    value = re.sub(r"[\s\-]", "", str(raw).translate(_DIGITS)).upper()
    return value if value.startswith("IR") else f"IR{value}"


def validate_iban(raw: str) -> tuple[str, str]:
    """Returns (normalized IBAN, bank code) or raises IbanInvalid with reason format|checksum|bank."""
    iban = normalize_iban(raw)
    if not re.fullmatch(r"IR\d{24}", iban):
        raise IbanInvalid(details={"reason": "format"})
    rearranged = iban[4:] + "1827" + iban[2:4]  # I=18, R=27
    if int(rearranged) % 97 != 1:
        raise IbanInvalid(details={"reason": "checksum"})
    bank = iban[4:7]
    if bank not in BANKS:
        raise IbanInvalid(details={"reason": "bank"})
    return iban, bank


def mask_iban(iban: str) -> str:
    """IR82 **** **** **** **** **90 02 style: first 4 and last 4 characters."""
    return f"{iban[:4]}{'*' * (len(iban) - 8)}{iban[-4:]}"
