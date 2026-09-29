"use client";

import FormControl from "@mui/material/FormControl";
import FormHelperText, { type FormHelperTextProps } from "@mui/material/FormHelperText";
import InputLabel, { type InputLabelProps } from "@mui/material/InputLabel";
import OutlinedInput, { type OutlinedInputProps } from "@mui/material/OutlinedInput";
import { useThemeProps } from "@mui/material/styles";
import { forwardRef, useId, type FocusEventHandler, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import type { SxProps, Theme } from "@mui/material/styles";

// The outlined text field of the app (patterns.md §12), built from the same parts as MUI's
// TextField (FormControl, InputLabel, OutlinedInput, FormHelperText) and rendering the same DOM and
// classes, without TextField's `select` mode: that mode pulls Select, Menu, Popover, and List into
// every route with a form (§11.4 JS budget, wallet review W-22). Theme defaults for `MuiTextField`
// (fullWidth) still apply.

type HtmlInputProps = InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}` | `aria-${string}`, unknown>;

export interface TextInputProps {
  id?: string;
  name?: string;
  label?: ReactNode;
  value?: unknown;
  defaultValue?: unknown;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  helperText?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: OutlinedInputProps["onChange"];
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  className?: string;
  sx?: SxProps<Theme>;
  size?: "small" | "medium";
  slotProps?: {
    input?: Partial<OutlinedInputProps>;
    htmlInput?: HtmlInputProps;
    inputLabel?: Partial<InputLabelProps>;
    formHelperText?: Partial<FormHelperTextProps> & { component?: string };
  };
}

export const TextInput = forwardRef(function TextInput(inProps: TextInputProps, ref: Ref<HTMLDivElement>) {
  const props = useThemeProps({ props: inProps, name: "MuiTextField" }) as TextInputProps;
  const {
    id: idOverride,
    name,
    label,
    value,
    defaultValue,
    type,
    placeholder,
    autoComplete,
    autoFocus = false,
    disabled = false,
    error = false,
    required = false,
    fullWidth = false,
    multiline = false,
    rows,
    minRows,
    maxRows,
    helperText,
    inputRef,
    onChange,
    onBlur,
    onFocus,
    className,
    sx,
    size,
    slotProps = {},
  } = props;
  const autoId = useId();
  const id = idOverride ?? autoId;
  const helperTextId = helperText && id ? `${id}-helper-text` : undefined;
  const inputLabelId = label && id ? `${id}-label` : undefined;
  const labelProps = slotProps.inputLabel ?? {};

  return (
    <FormControl
      ref={ref}
      className={["MuiTextField-root", className].filter(Boolean).join(" ")}
      sx={sx}
      disabled={disabled}
      error={error}
      fullWidth={fullWidth}
      required={required}
      size={size}
      variant="outlined"
    >
      {label != null && label !== "" && (
        <InputLabel htmlFor={id} id={inputLabelId} {...labelProps}>
          {label}
        </InputLabel>
      )}
      <OutlinedInput
        aria-describedby={helperTextId}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        fullWidth={fullWidth}
        multiline={multiline}
        name={name}
        rows={rows}
        minRows={minRows}
        maxRows={maxRows}
        type={type}
        value={value}
        id={id}
        inputRef={inputRef}
        onBlur={onBlur}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        label={label}
        notched={typeof labelProps.shrink !== "undefined" ? labelProps.shrink : undefined}
        inputProps={slotProps.htmlInput}
        {...slotProps.input}
      />
      {helperText && (
        <FormHelperText id={helperTextId} {...(slotProps.formHelperText as Partial<FormHelperTextProps>)}>
          {helperText}
        </FormHelperText>
      )}
    </FormControl>
  );
});
