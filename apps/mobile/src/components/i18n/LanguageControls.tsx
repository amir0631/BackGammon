"use client";

import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { fontStack } from "@bg/design-tokens";
import { locales, type Locale } from "@bg/i18n";
import { api } from "@bg/api-client";
import { GlobeIcon } from "@/components/icons";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useFormat } from "@/lib/useFormat";
import { useLocaleSwitch } from "@/lib/locale";
import { useSession } from "@/lib/session";

// Language choice (auth.md AU-10, profile.md ST-01). Each option is written in its own language
// and font with `lang` set, whatever the UI language. Choosing applies at once (direction flips,
// strings swap) and keeps every form entry. Guests: the locale cookie only. Signed-in users: also
// `PATCH me {lang}`, so the choice follows the account to other devices.

/** Applies a language choice; returns false if the account could not be updated. */
export function useChooseLanguage() {
  const { switchLocale } = useLocaleSwitch();
  const { me, setMe } = useSession();
  return async (next: Locale): Promise<boolean> => {
    switchLocale(next);
    if (!me || me.lang === next) return true;
    try {
      setMe(await api.me.update({ lang: next }));
      return true;
    } catch {
      return false;
    }
  };
}

interface LanguageOptionsProps {
  value: Locale;
  onChange: (next: Locale) => void;
  disabled?: boolean;
  labelledBy?: string;
  describedBy?: string;
}

/** Radio group «فارسی» / "English", each option in its own language. */
export function LanguageOptions({ value, onChange, disabled, labelledBy, describedBy }: LanguageOptionsProps) {
  const t = useTranslations("languages");
  // Checked at once; the server re-render with the new locale follows a moment later.
  const [chosen, setChosen] = useState<Locale | null>(null);
  useEffect(() => setChosen(null), [value]);
  return (
    <RadioGroup
      value={chosen ?? value}
      onChange={(_, v) => {
        setChosen(v as Locale);
        onChange(v as Locale);
      }}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {locales.map((l) => (
        <FormControlLabel
          key={l}
          value={l}
          disabled={disabled}
          control={<Radio />}
          label={
            <span lang={l} dir={l === "fa" ? "rtl" : "ltr"} style={{ fontFamily: fontStack(l) }}>
              {t(l)}
            </span>
          }
          sx={{ minHeight: 48, marginInline: 0, gap: 0.5 }}
        />
      ))}
    </RadioGroup>
  );
}

/** Top-bar button on auth screens: globe + current language name; opens the sheet. */
export function LanguageButton() {
  const t = useTranslations();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const choose = useChooseLanguage();
  const headingId = useId();
  const current = t(`languages.${f.locale}`);
  const pending = useRef<Locale | null>(null);
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  // The sheet owns a history entry (back closes it). Closing pops that entry, and Next restores
  // the cached tree on popstate, which would undo a refresh started earlier. So the language is
  // applied only after the pop (or a short fallback if no pop happens).
  useEffect(() => {
    const next = pending.current;
    if (open || !next) return;
    pending.current = null;
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      window.removeEventListener("popstate", onPop);
      void chooseRef.current(next);
    };
    const onPop = () => window.setTimeout(apply, 0);
    window.addEventListener("popstate", onPop);
    const fallback = window.setTimeout(apply, 400);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(fallback);
    };
  }, [open]);

  return (
    <>
      <Button
        variant="text"
        color="inherit"
        onClick={() => setOpen(true)}
        startIcon={<GlobeIcon />}
        aria-label={t("auth.lang.button", { language: current })}
        aria-haspopup="dialog"
        sx={{ flex: "none", paddingInline: 1.5 }}
      >
        <span lang={f.locale}>{current}</span>
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={<span id={headingId}>{t("auth.lang.sheetTitle")}</span>}>
        <Typography component="div" sx={{ pb: 1 }}>
          <LanguageOptions
            value={f.locale}
            labelledBy={headingId}
            onChange={(next) => {
              if (next === f.locale) {
                setOpen(false);
                return;
              }
              pending.current = next;
              setOpen(false);
            }}
          />
        </Typography>
      </BottomSheet>
    </>
  );
}
