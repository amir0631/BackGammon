"use client";

import { styled } from "@mui/material/styles";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useId, type ReactNode } from "react";
import { iconSize, layout } from "@bg/design-tokens";
import { InfoIcon } from "@/components/icons";
import { tokensOf } from "@/theme/theme";

// Settings switch row (profile.md ST-01): the whole row is one target (a <label> around the
// switch), at least 56 px tall and growing with text; the switch stays at the end side and never
// overlaps the label at 200% text. The description and any status note are linked with
// aria-describedby. A disabled switch always carries its reason as visible text.

const Row = styled("label")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    minHeight: layout.listRowMinHeight,
    paddingBlock: theme.spacing(1.25),
    paddingInline: theme.spacing(2),
    cursor: "pointer",
    "&[data-disabled='true']": { cursor: "default" },
    "@media (hover: hover)": { "&:not([data-disabled='true']):hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "& .switch-text": { flex: "1 1 auto", minWidth: 0 },
    "& .switch-note": { display: "flex", gap: theme.spacing(0.75), alignItems: "flex-start", marginBlockStart: theme.spacing(0.5), color: t.textPrimary },
  };
});

export interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Status or reason line under the description (icon + text). */
  note?: ReactNode;
}

export function SwitchRow({ label, description, checked, onChange, disabled = false, note }: SwitchRowProps) {
  const descId = useId();
  const noteId = useId();
  const describedBy = [description ? descId : null, note ? noteId : null].filter(Boolean).join(" ") || undefined;
  return (
    <Row data-disabled={disabled}>
      <span className="switch-text">
        <Typography component="span" variant="body1" sx={{ display: "block" }}>
          {label}
        </Typography>
        {description && (
          <Typography id={descId} component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
            {description}
          </Typography>
        )}
        {note && (
          <Typography id={noteId} component="span" variant="body2" className="switch-note" role="status">
            <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
            <span>{note}</span>
          </Typography>
        )}
      </span>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        inputProps={{ "aria-describedby": describedBy }}
        sx={{ flex: "none" }}
      />
    </Row>
  );
}
