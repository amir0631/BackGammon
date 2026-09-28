"use client";

import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { digitsOnly, groupMobileNumber, normalizeMobileNumber } from "@bg/i18n";
import { useFormat } from "@/lib/useFormat";

// Iranian mobile number field (patterns.md §12). Country fixed to +98. Accepts Persian and Latin
// digits, spaces, and +98 / 0098 prefixes; `value` is always Latin digits. Display is grouped
// (۰۹۱۲ ۳۴۵ ۶۷۸۹) in the locale's digits and isolated left-to-right. Submit with
// `normalizeMobileNumber(value)` from @bg/i18n.

const MAX_DIGITS = 11;

export type PhoneFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (digits: string) => void;
};

export function PhoneField({ value, onChange, label, helperText, slotProps, ...rest }: PhoneFieldProps) {
  const t = useTranslations("forms.phone");
  const f = useFormat();
  const theme = useTheme();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
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
      value={f.digits(groupMobileNumber(value))}
      onChange={handleChange}
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
