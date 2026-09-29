"use client";

import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import { styled } from "@mui/material/styles";
import { forwardRef, useId, type ReactNode } from "react";
import { iconSize } from "@bg/design-tokens";
import { ErrorIcon, SuccessIcon } from "@/components/icons";

// Helper / error text for fields (patterns.md §4.1: icon + text, never color alone).

const Line = styled("span")(({ theme }) => ({
  display: "inline-flex",
  gap: theme.spacing(0.5),
  alignItems: "flex-start",
}));

/** Error helper text: error icon + message. Use as a TextField `helperText`. */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <Line>
      <ErrorIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
      <span>{children}</span>
    </Line>
  );
}

/** Positive helper text (e.g. "This username is available"): check icon + message. */
export function FieldSuccess({ children }: { children: ReactNode }) {
  return (
    <Line sx={{ color: "tokens.success" }}>
      <SuccessIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
      <span>{children}</span>
    </Line>
  );
}

export interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The full sentence. Links inside it stay separately focusable and never toggle the box. */
  label: ReactNode;
  error?: string | null;
  disabled?: boolean;
}

/** A real checkbox with its sentence as the label; the whole row is the target (auth.md AU-02). */
export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { checked, onChange, label, error, disabled },
  ref,
) {
  const errorId = useId();
  return (
    <FormControl error={Boolean(error)} disabled={disabled}>
      <FormControlLabel
        control={
          <Checkbox
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            inputRef={ref}
            inputProps={{
              "aria-invalid": Boolean(error) || undefined,
              "aria-describedby": error ? errorId : undefined,
            }}
          />
        }
        label={label}
        sx={{ alignItems: "flex-start", marginInline: 0, "& .MuiFormControlLabel-label": { pt: 1.25 } }}
      />
      {error && (
        <FormHelperText id={errorId} sx={{ marginInlineStart: 5.5 }}>
          <FieldError>{error}</FieldError>
        </FormHelperText>
      )}
    </FormControl>
  );
});
