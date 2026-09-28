import localFont from "next/font/local";

// Self-hosted (CLAUDE.md §2 rule 9, §11.3). Same OFL files as apps/mobile.
const vazirmatn = localFont({
  src: "../fonts/Vazirmatn-Variable.woff2",
  variable: "--font-fa",
  weight: "100 900",
  display: "swap",
});

const inter = localFont({
  src: "../fonts/InterVariable.woff2",
  variable: "--font-en",
  weight: "100 900",
  display: "swap",
});

export const fontVariables = `${vazirmatn.variable} ${inter.variable}`;
