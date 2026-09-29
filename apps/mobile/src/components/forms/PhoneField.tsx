"use client";

import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { useState, type ChangeEvent } from "react";
import { digitsOnly, groupMobileNumber, normalizeMobileNumber } from "@bg/i18n";
import { useFormat } from "@/lib/useFormat";

// Iranian mobile number field (patterns.md §12). Country fixed to +98. Accepts Persian and Latin
// digits, spaces, and +98 / 0098 prefixes; `value` is always Latin digits. While focused, the text
// stays exactly as typed (auth.md §6.2: never convert digits under the cursor); on blur it is shown
// grouped (۰۹۱۲ ۳۴۵ ۶۷۸۹) in the locale's digits, isolated left-to-right. Submit with
// `normalizeMobileNumber(value)` from @bg/i18n.

const MAX_DIGITS = 11;

export type PhoneFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (digits: string) => void;
};

export function PhoneField({ value, onChange, label, helperText, slotProps, onFocus, onBlur, ...rest }: PhoneFieldProps) {
  const t = useTranslations("forms.phone");
  const f = useFormat();
  const theme = useTheme();
  /** The text as typed while the field has focus; null shows the grouped display. */
  const [draft, setDraft] = useState<string | null>(null);
  const display = f.digits(groupMobileNumber(value));

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    const digits = digitsOnly(event.target.value);
    if (digits.length <= MAX_DIGITS) {
      onChange(digits);
      return;
    }
    // Pasted or autofilled international format: fold it to 09… when possible.
    onChange(normalizeMobileNumber(digits) ?? digits.slice(0, MAX_DIGITS));
  };

  return (
    <TextField
      {...rest}
      type="tel"
      label={label ?? t("label")}
      helperText={helperText ?? t("hint")}
      value={draft ?? display}
      onChange={handleChange}
      onFocus={(event) => {
        setDraft(display);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      autoComplete="tel"
      slotProps={{
        ...slotProps,
        htmlInput: {
          inputMode: "numeric",
          dir: "ltr",
          // With dir="ltr", "end" is the right edge: aligned with the label in fa.
          style: { textAlign: theme.direction === "rtl" ? "end" : "start" },
          ...(typeof slotProps?.htmlInput === "object" ? slotProps.htmlInput : {}),
        },
      }}
    />
  );
}
