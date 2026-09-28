"use client";

import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import { styled } from "@mui/material/styles";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { iconSize } from "@bg/design-tokens";
import { EyeIcon, EyeOffIcon, PendingIcon, SuccessIcon } from "@/components/icons";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Password field with a labelled show/hide toggle (patterns.md §12). Requirements are listed
// before typing, each with an icon and a spoken state, never color alone.

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export type PasswordFieldProps = Omit<TextFieldProps, "type"> & {
  /** "current-password" for login and step-up, "new-password" for signup and reset. */
  autoComplete: "current-password" | "new-password";
  requirements?: PasswordRequirement[];
};

const Requirements = styled("ul")(({ theme }) => ({
  listStyle: "none",
  margin: 0,
  marginBlockStart: theme.spacing(1),
  padding: 0,
  display: "grid",
  gap: theme.spacing(0.5),
  "& li": {
    display: "flex",
    alignItems: "flex-start",
    gap: theme.spacing(0.75),
    ...theme.typography.caption,
    color: tokensOf(theme).textSecondary,
  },
  "& li[data-met='true']": { color: tokensOf(theme).success },
}));

export function PasswordField({ autoComplete, requirements, label, slotProps, ...rest }: PasswordFieldProps) {
  const t = useTranslations("forms.password");
  const [visible, setVisible] = useState(false);
  const reqId = useId();

  const input = typeof slotProps?.input === "object" ? slotProps.input : {};
  const htmlInput = typeof slotProps?.htmlInput === "object" ? slotProps.htmlInput : {};

  return (
    <div>
      <TextField
        {...rest}
        type={visible ? "text" : "password"}
        label={label ?? t("label")}
        autoComplete={autoComplete}
        slotProps={{
          ...slotProps,
          htmlInput: {
            dir: "auto",
            spellCheck: false,
            autoCapitalize: "none",
            "aria-describedby": requirements?.length ? reqId : undefined,
            ...htmlInput,
          },
          input: {
            ...input,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  onClick={() => setVisible((v) => !v)}
                  // Keep focus (and the on-screen keyboard) in the field.
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={visible ? t("hide") : t("show")}
                  aria-pressed={visible}
                >
                  {visible ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      {requirements && requirements.length > 0 && (
        <div id={reqId}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {t("requirementsTitle")}
          </Typography>
          <Requirements>
            {requirements.map((r) => (
              <li key={r.label} data-met={r.met}>
                {r.met ? (
                  <SuccessIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />
                ) : (
                  <PendingIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />
                )}
                <span>{r.label}</span>{" "}
                <span style={visuallyHidden}>{r.met ? t("met") : t("notMet")}</span>
              </li>
            ))}
          </Requirements>
        </div>
      )}
    </div>
  );
}
