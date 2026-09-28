// MUI module augmentation for the app theme (docs/ui/design-system.md).
import type { ColorTokens } from "@bg/design-tokens";
import type { CSSProperties } from "react";
// Adds `theme.vars` (CSS variables mode) to the Theme type.
import type {} from "@mui/material/themeCssVarsAugmentation";

declare module "@mui/material/styles" {
  interface Palette {
    /** Every color token for the active scheme; with CSS variables, read via `theme.vars.palette.tokens`. */
    tokens: ColorTokens;
  }
  interface PaletteOptions {
    tokens?: ColorTokens;
  }

  interface TypographyVariants {
    bodyLarge: CSSProperties;
    label: CSSProperties;
    labelSmall: CSSProperties;
  }
  interface TypographyVariantsOptions {
    bodyLarge?: CSSProperties;
    label?: CSSProperties;
    labelSmall?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    bodyLarge: true;
    label: true;
    labelSmall: true;
  }
}
