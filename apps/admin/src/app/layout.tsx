import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { palette } from "@bg/design-tokens";
import { defaultLocale, direction, isLocale } from "@bg/i18n";
import { AdminProvider } from "@/lib/admin-context";
import { fontVariables } from "@/theme/fonts";
import { ThemeRegistry } from "@/theme/ThemeRegistry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t("admin.title")} · ${t("app.name")}`, robots: { index: false, follow: false } };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: palette.light.surface,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const current = await getLocale();
  const locale = isLocale(current) ? current : defaultLocale;
  const dir = direction(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeRegistry direction={dir} script={locale}>
            <Suspense>
              <AdminProvider>{children}</AdminProvider>
            </Suspense>
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
