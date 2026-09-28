"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@bg/api-client";
import type { Locale } from "@bg/i18n";
import type { AdminAuditEntry, AdminSetting } from "@bg/protocol";
import { ArrowIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";
import { dateTime, formatValue, type T } from "@/lib/format";

/** AD-07: audit entries for one setting, newest first. */
export function HistoryDrawer({
  setting,
  coinPrice,
  onClose,
}: {
  setting: AdminSetting | null;
  coinPrice: number;
  onClose: () => void;
}) {
  const t = useTranslations() as unknown as T;
  const locale = useLocale() as Locale;
  const { handleError } = useAdmin();
  const [rows, setRows] = useState<AdminAuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!setting) return;
    setRows(null);
    setFailed(false);
    api.admin
      .audit({ target_type: "setting", target_id: setting.key })
      .then((res) => setRows(res.results))
      .catch((error: unknown) => {
        if (!handleError(error)) setFailed(true);
      });
  }, [setting, handleError]);

  const show = (value: unknown) => (setting ? formatValue(t, locale, setting, value, coinPrice).text : "");

  return (
    <Drawer
      anchor="right"
      open={setting !== null}
      onClose={onClose}
      slotProps={{ transition: { onEntered: () => headingRef.current?.focus() } }}
      PaperProps={{ sx: { width: { xs: "100%", md: 400 } } }}
    >
      {setting && (
        <Box sx={{ p: 3 }} role="region" aria-labelledby="history-title">
          <Typography id="history-title" ref={headingRef} tabIndex={-1} variant="h6" component="h2">
            {t("admin.history.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {setting.description[locale]} ·{" "}
            <bdi dir="ltr" style={{ fontFamily: "monospace" }}>
              {setting.key}
            </bdi>
          </Typography>
          {failed && (
            <Typography color="error" role="alert">
              {t("admin.history.loadError")}
            </Typography>
          )}
          {!failed && rows === null && <Skeleton variant="rounded" height={160} />}
          {rows?.length === 0 && <Typography>{t("admin.history.empty")}</Typography>}
          <Stack component="ol" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {rows?.map((row) => (
              <Box component="li" key={row.id} sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  {dateTime(locale, row.created_at)} · <bdi dir="ltr">{row.admin}</bdi> ·{" "}
                  {t(row.action === "setting.reset" ? "admin.history.reset" : "admin.history.updated")}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 0.5, flexWrap: "wrap" }}>
                  <Typography variant="body2">{show(row.before)}</Typography>
                  <ArrowIcon fontSize="small" aria-hidden />
                  <Typography variant="body2" fontWeight={600}>
                    {show(row.after)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color={row.reason ? "text.primary" : "text.secondary"}>
                  {row.reason || t("admin.history.noReason")}
                </Typography>
                <Box component="details" sx={{ mt: 0.5 }}>
                  <Box component="summary" sx={{ cursor: "pointer", fontSize: 12 }}>
                    JSON
                  </Box>
                  <Box component="pre" dir="ltr" sx={{ fontSize: 12, whiteSpace: "pre-wrap", m: 0 }}>
                    {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
          <Button onClick={onClose} sx={{ mt: 3 }}>
            {t("admin.history.close")}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
