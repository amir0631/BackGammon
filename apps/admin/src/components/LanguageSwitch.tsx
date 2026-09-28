"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, locales, type Locale } from "@bg/i18n";

/** Host-only cookie on `admin.` (no Domain), applied with a server refresh; client state survives. */
export function LanguageSwitch() {
  const t = useTranslations("admin.lang");
  const locale = useLocale() as Locale;
  const router = useRouter();

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={locale}
      aria-label="Language"
      onChange={(_, next: Locale | null) => {
        if (!next || next === locale) return;
        document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
        router.refresh();
      }}
    >
      {locales.map((l) => (
        <ToggleButton key={l} value={l} lang={l} sx={{ px: 1.5, minHeight: 36 }}>
          {t(l)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
