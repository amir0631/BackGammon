"use client";

import ButtonBase from "@mui/material/ButtonBase";
import { styled, type Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useId, type ComponentType, type ReactNode } from "react";
import { layout, radii } from "@bg/design-tokens";
import { ChevronForwardIcon, type IconProps } from "@/components/icons";
import { tokensOf } from "@/theme/theme";

// Grouped list rows for hubs and settings (profile.md AC-01): inset groups on `surface`, rows at
// least 56 px tall that grow with text, icon + label, a chevron that mirrors in RTL (decorative).
// The current route's row is marked with aria-current and a filled indicator (not color alone).

const Group = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
}));

const Rows = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

function rowStyles(theme: Theme) {
  const t = tokensOf(theme);
  return {
    position: "relative",
    width: "100%",
    minHeight: layout.listRowMinHeight,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing(1.5),
    paddingBlock: theme.spacing(1),
    paddingInline: theme.spacing(2),
    textAlign: "start",
    color: t.textPrimary,
    "& .row-icon": { flex: "none", color: t.textSecondary },
    "& .row-label": { flex: "1 1 auto", minWidth: 0 },
    "& .row-chevron": { flex: "none", color: t.textSecondary },
  } as const;
}

const RowButton = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    ...rowStyles(theme),
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    // Current route: filled row plus a bar on the start edge (not color alone).
    "&[aria-current='page']": { backgroundColor: t.primaryContainer, color: t.onPrimaryContainer },
    "&[aria-current='page']::before": {
      content: '""',
      position: "absolute",
      insetBlock: 0,
      insetInlineStart: 0,
      width: theme.spacing(0.5),
      backgroundColor: t.primary,
    },
    "&[aria-current='page'] .row-icon, &[aria-current='page'] .row-chevron": { color: "inherit" },
    "&.Mui-focusVisible": { outlineOffset: -2 },
  };
}) as typeof ButtonBase;

const StaticRow = styled("div")(({ theme }) => rowStyles(theme));

export function NavGroup({ title, children }: { title?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Group aria-labelledby={title ? titleId : undefined}>
      {title && (
        <Typography id={titleId} variant="labelSmall" component="h2" color="text.secondary" sx={{ paddingInline: 1 }}>
          {title}
        </Typography>
      )}
      <Rows>{children}</Rows>
    </Group>
  );
}

interface RowContentProps {
  icon?: ComponentType<IconProps>;
  label: ReactNode;
  secondary?: ReactNode;
  chevron?: boolean;
}

function RowContent({ icon: Icon, label, secondary, chevron = true }: RowContentProps) {
  return (
    <>
      {Icon && <Icon className="row-icon" />}
      <span className="row-label">
        <Typography component="span" variant="body1" sx={{ display: "block" }}>
          {label}
        </Typography>
        {secondary && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
            {secondary}
          </Typography>
        )}
      </span>
      {chevron && <ChevronForwardIcon className="row-chevron" />}
    </>
  );
}

export function NavRow({ href, current, ...content }: RowContentProps & { href: string; current?: boolean }) {
  return (
    <li>
      <RowButton component={NextLink} href={href} aria-current={current ? "page" : undefined}>
        <RowContent {...content} />
      </RowButton>
    </li>
  );
}

export function ActionRow({ onClick, ...content }: RowContentProps & { onClick: () => void }) {
  return (
    <li>
      <RowButton onClick={onClick}>
        <RowContent {...content} />
      </RowButton>
    </li>
  );
}

/** A non-interactive row (read-only value). */
export function InfoRow({ icon: Icon, label, value }: { icon?: ComponentType<IconProps>; label: ReactNode; value: ReactNode }) {
  return (
    <li>
      <StaticRow>
        {Icon && <Icon className="row-icon" />}
        <span className="row-label">
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
            {label}
          </Typography>
          <Typography component="span" variant="body1" sx={{ display: "block" }}>
            {value}
          </Typography>
        </span>
      </StaticRow>
    </li>
  );
}
