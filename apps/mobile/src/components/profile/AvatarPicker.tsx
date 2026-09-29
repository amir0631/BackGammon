"use client";

import Skeleton from "@mui/material/Skeleton";
import { styled } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { avatarSize, borderWidth, focusRing, iconSize, radii } from "@bg/design-tokens";
import { CheckIcon } from "@/components/icons";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";
import { Avatar } from "./Avatar";

// Avatar picker (auth.md AU-05, profile.md AC-02). A native radio group: one tab stop, arrow keys
// move (mirrored by the browser in RTL), screen readers announce name + checked state. Options are
// at least 56 × 56 px with 8 px gaps and grow with text size, so 200% text drops columns instead
// of shrinking targets. The selected option shows a check badge and a thick outline (not color
// alone). `value` null = nothing selected (AU-05 never pre-selects).

const Grid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(max(${avatarSize.md + 8}px, 4rem), 1fr))`,
  gap: theme.spacing(1),
  margin: 0,
  padding: 0,
  border: 0,
  minWidth: 0,
}));

const Option = styled("label")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: "1",
    minWidth: avatarSize.md,
    minHeight: avatarSize.md,
    borderRadius: radii.lg,
    cursor: "pointer",
    "& .avatar-frame": {
      position: "relative",
      display: "flex",
      borderRadius: "50%",
      padding: 3,
      width: "100%",
      maxWidth: avatarSize.lg,
      boxShadow: `0 0 0 ${borderWidth.hairline}px ${t.outlineSubtle}`,
      transition: theme.transitions.create("box-shadow", { duration: theme.transitions.duration.shorter }),
    },
    "& .avatar-frame svg": { width: "100%", height: "auto" },
    "@media (hover: hover)": {
      "&:hover .avatar-frame": { boxShadow: `0 0 0 ${borderWidth.emphasis}px ${t.outline}` },
    },
    "& input:focus-visible + .avatar-frame": {
      outline: `${focusRing.width}px solid ${t.focusRing}`,
      outlineOffset: focusRing.offset + 2,
    },
    "& input:checked + .avatar-frame": { boxShadow: `0 0 0 3px ${t.primary}` },
    "& .avatar-check": {
      display: "none",
      position: "absolute",
      insetBlockEnd: 0,
      insetInlineEnd: 0,
      alignItems: "center",
      justifyContent: "center",
      width: iconSize.md,
      height: iconSize.md,
      borderRadius: "50%",
      backgroundColor: t.primary,
      color: t.onPrimary,
      border: `2px solid ${t.surface}`,
    },
    "& input:checked + .avatar-frame .avatar-check": { display: "flex" },
  };
});

export interface AvatarPickerProps {
  avatars: readonly string[];
  value: string | null;
  onChange: (key: string) => void;
  /** Id of the visible heading that names the group. */
  labelledBy: string;
  disabled?: boolean;
}

export function AvatarPicker({ avatars, value, onChange, labelledBy, disabled = false }: AvatarPickerProps) {
  const t = useTranslations("avatars");
  const name = useId();

  return (
    <Grid role="radiogroup" aria-labelledby={labelledBy}>
      {avatars.map((key) => {
        const label = t.has(key) ? t(key) : t("fallback");
        return (
          <Option key={key}>
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              disabled={disabled}
              style={visuallyHidden}
              aria-label={label}
            />
            <span className="avatar-frame" aria-hidden>
              <Avatar avatarKey={key} size={avatarSize.lg} />
              <span className="avatar-check">
                <CheckIcon sx={{ fontSize: iconSize.sm }} />
              </span>
            </span>
          </Option>
        );
      })}
    </Grid>
  );
}

export function AvatarPickerSkeleton({ count = 12 }: { count?: number }) {
  const t = useTranslations("common");
  return (
    <div aria-busy="true">
      <span role="status" style={visuallyHidden}>
        {t("loading")}
      </span>
      <Grid aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} variant="circular" sx={{ width: "100%", height: "auto", aspectRatio: "1", maxWidth: avatarSize.lg }} />
        ))}
      </Grid>
    </div>
  );
}
