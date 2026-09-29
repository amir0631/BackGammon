"use client";

import { styled } from "@mui/material/styles";
import { layout } from "@bg/design-tokens";
import { bottomInset, mqXs } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// Primary action footer on tab-child screens with the bottom nav (shop item, tournament detail):
// on phones it sticks above the nav in the thumb zone (P§1, §11.7 bottom 40 %); from md, and on
// short landscape screens, it stays in the flow. The nav height comes from `--app-bottom-inset`.

export const StickyActions = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    paddingBlock: theme.spacing(1.5),
    [`@media (max-width: 599.98px) and (min-height: ${layout.compactHeight}px)`]: {
      position: "sticky",
      insetBlockEnd: bottomInset,
      zIndex: 2,
      marginInline: `-${layout.gutter.sm}px`,
      paddingInline: `${layout.gutter.sm}px`,
      backgroundColor: t.background,
      borderBlockStart: `1px solid ${t.outlineSubtle}`,
      [mqXs]: { marginInline: `-${layout.gutter.xs}px`, paddingInline: `${layout.gutter.xs}px` },
    },
  };
});
