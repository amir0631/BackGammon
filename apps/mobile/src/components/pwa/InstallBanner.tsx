"use client";

import Box from "@mui/material/Box";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { installBannerDue, isInstallHost, recordInstallShow, type InstallRecord } from "@bg/api-client";
import { Banner } from "@/components/feedback/Banner";
import { InstallIcon } from "@/components/icons/extra";
import { useToast } from "@/components/feedback/Toast";
import { promptInstall, usePwa } from "@/lib/pwa";
import { readJson, writeJson } from "@/lib/storage";
import { gutterStyles } from "@/theme/layout";
import { InstallSheet } from "./InstallSheet";

// SY-05 install banner (CLAUDE.md §11.5; patterns.md §15): on the tab roots only (never in a match,
// matchmaking, payment, transfer, or withdrawal flow), dismissible; shown on the first visit, again
// after 7 days, at most 3 times. Android uses the captured prompt; iOS opens the guide sheet.
// Browsers without either get only the permanent "Install app" item in the Account tab.

const RECORD_KEY = "bg.install.record";
const VISIT_KEY = "bg.install.visit";

type Visit = "showing" | "dismissed";

export function InstallBanner({ suppressed = false }: { suppressed?: boolean }) {
  const t = useTranslations("install");
  const pathname = usePathname();
  const pwa = usePwa();
  const toast = useToast();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [sheet, setSheet] = useState(false);

  const eligible = pwa.ready && (pwa.platform === "prompt" || pwa.platform === "ios") && isInstallHost(pathname) && !suppressed;

  useEffect(() => {
    if (!eligible) return;
    const current = readJson<Visit>("session", VISIT_KEY);
    if (current) {
      setVisit(current);
      return;
    }
    const record = readJson<InstallRecord>("local", RECORD_KEY);
    if (!installBannerDue(record, Date.now())) return;
    writeJson("local", RECORD_KEY, recordInstallShow(record, Date.now()));
    writeJson("session", VISIT_KEY, "showing");
    setVisit("showing");
  }, [eligible]);

  const dismiss = () => {
    writeJson("session", VISIT_KEY, "dismissed");
    setVisit("dismissed");
  };

  const install = async () => {
    if (pwa.platform === "ios") {
      setSheet(true);
      return;
    }
    const accepted = await promptInstall();
    dismiss();
    if (accepted) toast.show({ message: t("done") });
  };

  return (
    <>
      {eligible && visit === "showing" && (
        <Box sx={{ ...gutterStyles, pt: 1.5 }}>
          <Banner
            severity="info"
            icon={InstallIcon}
            title={t("banner.title")}
            action={{ label: pwa.platform === "ios" ? t("banner.how") : t("banner.install"), onClick: () => void install() }}
            onClose={dismiss}
            closeLabel={t("banner.dismiss")}
          >
            {t("banner.body")}
          </Banner>
        </Box>
      )}
      <InstallSheet open={sheet} onClose={() => setSheet(false)} platform={pwa.platform} />
    </>
  );
}
