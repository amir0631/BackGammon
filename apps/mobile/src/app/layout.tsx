import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { defaultColorMode, palette } from "@bg/design-tokens";
import { direction, isLocale, defaultLocale } from "@bg/i18n";
import { fontVariables } from "@/theme/fonts";
import { ThemeRegistry } from "@/theme/ThemeRegistry";
import { AppProviders } from "./AppProviders";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("name"),
    description: t("tagline"),
    // §11.5: `m.` is installable; the manifest is localized by the locale cookie.
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Dark is the default scheme; the chrome color matches its page background.
  themeColor: palette[defaultColorMode].background,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const current = await getLocale();
  const locale = isLocale(current) ? current : defaultLocale;
  const dir = direction(locale);
  const messages = await getMessages();

  return (
    // The color-scheme script sets a data attribute on <html> before hydration.
    <html lang={locale} dir={dir} className={fontVariables} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data" defaultMode={defaultColorMode} modeStorageKey="bg-color-mode" />
        {/* §11.5: keep Chromium's install prompt for the custom banner until lib/pwa.ts loads. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bgInstallPrompt=e});",
          }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeRegistry direction={dir} script={locale}>
            <AppProviders>{children}</AppProviders>
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
