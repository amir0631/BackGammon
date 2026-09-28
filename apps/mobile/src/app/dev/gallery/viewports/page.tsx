import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { radii, reviewViewports, space } from "@bg/design-tokens";
import { defaultLocale, formatNumber, isLocale } from "@bg/i18n";
import { assertGalleryEnabled } from "../guard";

// All §11.7 review viewports side by side, each an iframe of /dev/gallery at its real size,
// scaled down to fit. Portrait viewports from the list plus the two phone landscapes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PHONE_SCALE = 0.6;
const WIDE_SCALE = 0.45;

export default async function ViewportsPage({ searchParams }: { searchParams: Promise<{ text?: string }> }) {
  assertGalleryEnabled();
  const t = await getTranslations("devGallery.controls");
  const current = await getLocale();
  const locale = isLocale(current) ? current : defaultLocale;
  const { text } = await searchParams;
  const src = text === "200" ? "/dev/gallery?text=200" : "/dev/gallery";

  const frames = [
    ...reviewViewports.map((v) => ({ ...v, landscape: false })),
    { width: 844, height: 390, name: "phone-reference-landscape", landscape: true },
    { width: 800, height: 360, name: "phone-small-landscape", landscape: true },
  ];

  return (
    <main style={{ padding: space.xl }}>
      <h1 style={{ margin: 0 }}>{t("viewports")}</h1>
      <p>{t("viewportsHint")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.xl, alignItems: "flex-start" }}>
        {frames.map((f) => {
          const scale = f.width <= 500 || f.landscape ? PHONE_SCALE : WIDE_SCALE;
          const size = `${formatNumber(locale, f.width)} × ${formatNumber(locale, f.height)}`;
          return (
            <figure key={f.name} style={{ margin: 0 }}>
              <figcaption style={{ marginBlockEnd: space.sm }}>
                <bdi dir="ltr">{size}</bdi>
                {f.landscape ? ` · ${t("landscape")}` : ""} ·{" "}
                <a href={src} target="_blank" rel="noopener">
                  {t("openFrame")}
                </a>
              </figcaption>
              {/* LTR box so the top-left scale origin lines up in both directions. */}
              <div
                dir="ltr"
                style={{
                  width: f.width * scale,
                  height: f.height * scale,
                  overflow: "hidden",
                  borderRadius: radii.lg,
                  outline: "1px solid currentColor",
                }}
              >
                <iframe
                  title={size}
                  src={src}
                  width={f.width}
                  height={f.height}
                  style={{ border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                />
              </div>
            </figure>
          );
        })}
      </div>
    </main>
  );
}
