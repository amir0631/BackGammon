"use client";

import Link, { type LinkProps } from "@mui/material/Link";
import NextLink from "next/link";
import type { ReactNode } from "react";
import { minTouchTarget } from "@bg/design-tokens";

// A text link that stands on its own line ("Forgot password?", "Terms of use"): underlined (not
// color alone) with a 44 px tall hit area. Links inside a sentence use plain <Link> (inline
// targets are exempt from the size rule, WCAG 2.5.8).

export type StandaloneLinkProps = Omit<LinkProps<typeof NextLink>, "component"> & { href: string };

export function StandaloneLink({ sx, ...rest }: StandaloneLinkProps) {
  return (
    <Link
      component={NextLink}
      variant="body2"
      {...rest}
      sx={[
        { display: "inline-flex", alignItems: "center", minHeight: minTouchTarget, paddingInline: 0.5 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

/**
 * The link in a short prompt line ("Already have an account? Log in"). The phrase can be a single
 * short word, so it gets the full 44 × 44 target while flowing with the text.
 */
export function PromptLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) {
  return (
    <Link
      component={NextLink}
      href={href}
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: minTouchTarget,
        minWidth: minTouchTarget,
        paddingInline: 0.5,
        verticalAlign: "middle",
      }}
    >
      {children}
    </Link>
  );
}
