import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { direction, isLocale, defaultLocale } from "@bg/i18n";
import { ThemeRegistry } from "@/theme/ThemeRegistry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name"), description: t("tagline") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14110f",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const current = await getLocale();
  const locale = isLocale(current) ? current : defaultLocale;
  const dir = direction(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeRegistry direction={dir}>{children}</ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
