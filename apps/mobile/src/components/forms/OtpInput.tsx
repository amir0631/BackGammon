"use client";

import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { borderWidth, focusRing, iconSize, layout, radii } from "@bg/design-tokens";
import { digitsOnly } from "@bg/i18n";
import { ErrorIcon } from "@/components/icons";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// SMS code input (patterns.md §12): ONE real <input> (autocomplete="one-time-code",
// inputmode="numeric") laid over five visual boxes, so SMS autofill, paste, and screen readers
// all see a single field. Persian, Arabic-Indic, and Latin digits are accepted and normalized to
// Latin; boxes render the locale's digits. Codes are read left to right in both locales.

const Wrap = styled("div")({ position: "relative", width: "100%" });

const Boxes = styled("div")(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  justifyContent: "center",
}));

const Box = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    flex: "1 1 0",
    minWidth: 0,
    maxWidth: `${layout.otpBox.maxWidthRem}rem`,
    height: `${layout.otpBox.heightRem}rem`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    border: `${borderWidth.control}px solid ${t.outline}`,
    backgroundColor: t.surfaceSunken,
    color: t.textPrimary,
    ...theme.typography.h3,
    fontVariantNumeric: "tabular-nums",
    "&[data-active='true']": {
      outline: `${focusRing.width}px solid ${t.focusRing}`,
      outlineOffset: -borderWidth.control,
    },
    "&[data-error='true']": { borderColor: t.error, borderWidth: borderWidth.emphasis },
    "&[data-disabled='true']": { color: t.textDisabled, borderColor: t.outlineSubtle },
  };
});

const HiddenInput = styled("input")({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "transparent",
  caretColor: "transparent",
  // 16 px keeps iOS from zooming; the text itself is invisible.
  fontSize: "1rem",
  letterSpacing: 0,
  outline: "none",
  "&::selection": { background: "transparent" },
  "&:disabled": { cursor: "not-allowed" },
});

export interface OtpInputProps {
  /** Latin digits only (already normalized). */
  value: string;
  onChange: (digits: string) => void;
  /** Called once when the last digit is entered (auto-submit, patterns.md §12). */
  onComplete?: (code: string) => void;
  length?: number;
  label?: string;
  /** Inline field error (icon + text, never color alone). */
  error?: string;
  helperText?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  /** The real input, for callers that manage focus (TaskFlow `initialFocus`). */
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 5,
  label,
  error,
  helperText,
  disabled = false,
  autoFocus = false,
  name = "otp",
  inputRef: externalRef,
}: OtpInputProps) {
  const t = useTranslations("forms.otp");
  const f = useFormat();
  const id = useId();
  const describedBy = `${id}-desc`;
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? ownRef;
  const [focused, setFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = digitsOnly(event.target.value).slice(0, length);
    onChange(next);
    if (next.length === length && value.length !== length) onComplete?.(next);
  };

  // Keep the caret at the end: the boxes show a single insertion point.
  const pinCaret = () => {
    const el = inputRef.current;
    if (el && el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
  };

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div>
      <Typography component="label" htmlFor={id} variant="label" sx={{ display: "block", mb: 1 }}>
        {label ?? t("label")}
      </Typography>
      <Wrap dir="ltr">
        <Boxes aria-hidden>
          {Array.from({ length }, (_, i) => (
            <Box
              key={i}
              data-active={focused && i === activeIndex}
              data-error={Boolean(error)}
              data-disabled={disabled}
            >
              {value[i] ? f.digits(value[i]) : ""}
            </Box>
          ))}
        </Boxes>
        <HiddenInput
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          onFocus={() => {
            setFocused(true);
            pinCaret();
          }}
          onBlur={() => setFocused(false)}
          onSelect={pinCaret}
          inputMode="numeric"
          autoComplete="one-time-code"
          // Pasted Persian digits pass through and are normalized in onChange.
          maxLength={length * 4}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCorrect="off"
        />
      </Wrap>
      <div id={describedBy}>
        {error ? (
          <Typography
            variant="caption"
            role="alert"
            sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", mt: 1, color: "tokens.error" }}
          >
            <ErrorIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />
            {error}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {helperText ?? t("hint", { length: f.number(length) })}
          </Typography>
        )}
      </div>
    </div>
  );
}
