"use client";

import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useId, type ComponentType, type ReactNode } from "react";
import { borderWidth, focusRing, iconSize, minTouchTarget, radii } from "@bg/design-tokens";
import { CheckIcon, type IconProps } from "@/components/icons";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Single choice as a native radio group (play.md PL-02, PL-04; P§2.2): one tab stop, arrow keys
// move (the browser mirrors them in RTL), nothing pre-selected unless the caller passes a value.
// Two looks: `cards` (label + one-line description, full width) and `chips` (short labels that
// wrap). Selected = check icon + 2 px outline + bolder label (never color alone). Every option is
// at least 44 px tall and grows with text size.

const Fieldset = styled("fieldset")({ margin: 0, padding: 0, border: 0, minWidth: 0 });

const Options = styled("div")(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  "&[data-layout='cards']": { flexDirection: "column", flexWrap: "nowrap" },
  "&[data-layout='grid']": {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr))",
  },
}));

const Option = styled("label")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.25),
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingBlock: theme.spacing(1),
    paddingInline: theme.spacing(1.75),
    borderRadius: radii.md,
    border: `${borderWidth.control}px solid ${t.outline}`,
    backgroundColor: t.surface,
    cursor: "pointer",
    transition: theme.transitions.create(["border-color", "box-shadow", "background-color"], {
      duration: theme.transitions.duration.shorter,
    }),
    "&[data-layout='chips']": { borderRadius: radii.pill, paddingInline: theme.spacing(2) },
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "&:has(input:focus-visible)": { outline: `${focusRing.width}px solid ${t.focusRing}`, outlineOffset: focusRing.offset },
    "&:has(input:checked)": {
      borderColor: t.primary,
      boxShadow: `inset 0 0 0 ${borderWidth.emphasis - borderWidth.control}px ${t.primary}`,
      backgroundColor: t.primaryContainer,
      color: t.onPrimaryContainer,
    },
    "&:has(input:disabled)": { cursor: "not-allowed", opacity: 0.6 },
    "& .choice-check": { display: "none", flex: "none" },
    "&:has(input:checked) .choice-check": { display: "inline-flex" },
    "&:has(input:checked) .choice-label": { fontWeight: theme.typography.fontWeightBold },
    "& .choice-text": { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: theme.spacing(0.25) },
    "&:has(input:checked) .choice-desc": { color: "inherit" },
  };
});

export interface ChoiceOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Extra words for the accessible name (e.g. "Bot"), when the visible label lacks them. */
  ariaLabel?: string;
  description?: ReactNode;
  /** A status line under the label (icon + text), e.g. "Needs 500 coins". */
  note?: ReactNode;
  icon?: ComponentType<IconProps>;
  disabled?: boolean;
}

export interface ChoiceGroupProps<V extends string | number> {
  legend: ReactNode;
  options: readonly ChoiceOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  layout?: "cards" | "chips" | "grid";
  /** Id of a visible message (field error) linked to the group. */
  describedBy?: string;
  /** Extra content next to the legend (a "?" link). */
  legendAction?: ReactNode;
}

export function ChoiceGroup<V extends string | number>({
  legend,
  options,
  value,
  onChange,
  layout = "cards",
  describedBy,
  legendAction,
}: ChoiceGroupProps<V>) {
  const name = useId();
  return (
    <Fieldset aria-describedby={describedBy}>
      <Typography
        component="legend"
        variant="labelSmall"
        color="text.secondary"
        sx={{ p: 0, mb: 1, display: "flex", alignItems: "center", gap: 1, width: "100%" }}
      >
        <span>{legend}</span>
        {legendAction}
      </Typography>
      <Options data-layout={layout}>
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <Option key={String(option.value)} data-layout={layout}>
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={option.disabled}
                style={visuallyHidden}
                aria-label={option.ariaLabel}
              />
              {Icon && <Icon sx={{ fontSize: iconSize.md, flex: "none" }} />}
              <span className="choice-text">
                <Typography className="choice-label" variant={layout === "chips" ? "label" : "body1"} component="span" sx={{ color: "inherit" }}>
                  {option.label}
                </Typography>
                {option.description && (
                  <Typography className="choice-desc" variant="body2" component="span" color="text.secondary">
                    {option.description}
                  </Typography>
                )}
                {option.note && (
                  <Typography className="choice-desc" variant="caption" component="span" color="text.secondary">
                    {option.note}
                  </Typography>
                )}
              </span>
              <CheckIcon className="choice-check" sx={{ fontSize: iconSize.sm }} />
            </Option>
          );
        })}
      </Options>
    </Fieldset>
  );
}
