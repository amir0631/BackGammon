"use client";

import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import { TextInput as TextField } from "@/components/forms/TextInput";
import { useId, type ReactNode, type Ref } from "react";
import { iconSize } from "@bg/design-tokens";
import { FieldError } from "@/components/forms/FieldText";
import { CoinIcon } from "@/components/icons";
import { InfoLine } from "./InfoLine";

// Coin amount input for transfer and withdrawal (wallet.md TR-02, WD-03).
// - Starts empty (P§2.2). Accepts Persian, Arabic-Indic, and Latin digits; nothing is converted
//   under the cursor (P§12). The value is LTR while the label follows the UI direction.
// - Helper lines (minimum, 24-hour window, movable now) are visible before typing and linked by
//   aria-describedby; the error (icon + text) replaces nothing, it is added above them.

export interface AmountFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: ReactNode;
  helpers: string[];
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  name?: string;
  autoFocus?: boolean;
}

export function AmountField({ label, value, onChange, onBlur, error, helpers, disabled, inputRef, name = "amount", autoFocus }: AmountFieldProps) {
  const helpersId = useId();
  const errorId = useId();
  return (
    <Stack spacing={1}>
      <TextField
        name={name}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        autoFocus={autoFocus}
        inputRef={inputRef}
        error={Boolean(error)}
        helperText={error ? <FieldError>{error}</FieldError> : undefined}
        slotProps={{
          formHelperText: { id: errorId, component: "div" } as object,
          htmlInput: {
            dir: "ltr",
            inputMode: "numeric",
            autoComplete: "off",
            enterKeyHint: "next",
            "aria-invalid": Boolean(error) || undefined,
            "aria-describedby": [error ? errorId : null, helpersId].filter(Boolean).join(" "),
            style: { fontVariantNumeric: "tabular-nums" },
          },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <CoinIcon sx={{ fontSize: iconSize.md }} />
              </InputAdornment>
            ),
          },
        }}
      />
      <Stack id={helpersId} component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {helpers.map((line) => (
          <InfoLine key={line} component="li">
            {line}
          </InfoLine>
        ))}
      </Stack>
    </Stack>
  );
}
