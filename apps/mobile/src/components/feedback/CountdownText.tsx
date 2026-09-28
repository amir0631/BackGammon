"use client";

import { useState } from "react";
import { visuallyHidden } from "@/theme/layout";

// A sentence with a live mm:ss countdown inside (auth.md §5 timing rules). The visible text ticks
// every second, but screen readers get a static copy with the starting time, so a live region
// around it announces once at the start, never every second. The caller swaps in another message
// (announced politely) when the countdown reaches 0.

export interface CountdownTextProps {
  seconds: number;
  /** Builds the sentence for a given mm:ss string (already localized and bidi-isolated). */
  render: (time: string) => string;
  /** Localized mm:ss formatter. */
  clock: (seconds: number) => string;
}

export function CountdownText({ seconds, render, clock }: CountdownTextProps) {
  const [initial] = useState(seconds);
  const time = (s: number) => `⁦${clock(s)}⁩`;
  return (
    <>
      <span aria-hidden style={{ fontVariantNumeric: "tabular-nums" }}>
        {render(time(seconds))}
      </span>
      <span style={visuallyHidden}>{render(time(initial))}</span>
    </>
  );
}
