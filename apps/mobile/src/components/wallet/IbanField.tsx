"use client";

import InputAdornment from "@mui/material/InputAdornment";
import { useTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef } from "react";
import { FieldError, FieldSuccess } from "@/components/forms/FieldText";
import { groupIban, type IbanProblem } from "@bg/api-client";

// ---- Sheba input ---------------------------------------------------------------------------------

export interface IbanFieldProps {
  /** Latin digits after "IR" (possibly incomplete). */
  digits: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
  problem: IbanProblem | null;
  /** Bank name once the value is valid and the bank is known ("Bank: Melli"). */
  bank?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
}

/** Characters that count as a digit in what the user typed (Latin, Persian, Arabic-Indic). */
const DIGIT = /[0-9۰-۹٠-٩]/;

/**
 * Fixed "IR" prefix + 24 digits, shown in groups of 4 (LTR). Paste works with or without IR,
 * spaces or dashes, and Persian digits; the caret keeps its place among the digits while groups
 * are re-spaced.
 */
export function IbanField({ digits, onChange, onBlur, problem, bank, disabled, autoFocus, name = "iban" }: IbanFieldProps) {
  const t = useTranslations("bank");
  const theme = useTheme();
  const helperId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const display = groupIban(digits).join(" ");

  // Put the caret back after the same number of digits once the grouped value renders.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const count = caretDigits.current;
    if (!input || count === null || document.activeElement !== input) return;
    caretDigits.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < display.length && seen < count) {
      if (/[0-9]/.test(display[pos] ?? "")) seen += 1;
      pos += 1;
    }
    input.setSelectionRange(pos, pos);
  }, [display]);

  const change = (raw: string, caret: number | null) => {
    let value = raw.replace(/^\s*[iI][rR]/, "");
    const before = caret === null ? null : raw.slice(0, caret).replace(/^\s*[iI][rR]/, "");
    caretDigits.current = before === null ? null : [...before].filter((c) => DIGIT.test(c)).length;
    value = [...value]
      .filter((c) => DIGIT.test(c))
      .join("")
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
    onChange(value);
  };

  const errorText =
    problem === "required"
      ? t("error.required")
      : problem === "format"
        ? t("error.format")
        : problem === "checksum"
          ? t("error.checksum")
          : problem === "bank"
            ? t("error.bank")
            : null;

  const prefix = (
    <InputAdornment position={theme.direction === "rtl" ? "end" : "start"}>
      <bdi dir="ltr">{t("field.prefix")}</bdi>
    </InputAdornment>
  );

  return (
    <TextField
      inputRef={inputRef}
      name={name}
      label={t("field.label")}
      value={display}
      onChange={(e) => change(e.target.value, e.target.selectionStart)}
      onBlur={onBlur}
      disabled={disabled}
      autoFocus={autoFocus}
      error={Boolean(errorText)}
      helperText={
        errorText ? (
          <FieldError>{errorText}</FieldError>
        ) : bank ? (
          <FieldSuccess>{t("valid.bank", { bank })}</FieldSuccess>
        ) : (
          t("field.helper")
        )
      }
      slotProps={{
        formHelperText: { id: helperId, component: "div" } as object,
        htmlInput: {
          dir: "ltr",
          inputMode: "numeric",
          autoComplete: "off",
          autoCorrect: "off",
          spellCheck: false,
          "aria-describedby": helperId,
          "aria-invalid": Boolean(errorText) || undefined,
          style: { fontVariantNumeric: "tabular-nums" },
        },
        // The label and outline follow the UI direction; the number itself is LTR. "IR" must sit
        // at the physical left of the digits, which is the end side in RTL.
        input:
          theme.direction === "rtl"
            ? { endAdornment: prefix }
            : { startAdornment: prefix },
      }}
    />
  );
}
