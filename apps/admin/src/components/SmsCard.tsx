"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import type { Locale } from "@bg/i18n";
import type { SmsStatus } from "@bg/protocol";
import { CheckIcon, ClockIcon, InfoIcon, WarningIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin-context";
import { dateTime, num } from "@/lib/format";

const PURPOSE: Record<string, string> = {
  "sms.pattern_otp": "otp",
  "sms.pattern_withdrawal_paid": "withdrawalPaid",
};

export function PatternStatusChip({ status }: { status: string }) {
  const t = useTranslations("admin.sms.status");
  if (status === "active") return <Chip size="small" color="success" variant="outlined" icon={<CheckIcon />} label={t("active")} />;
  if (status === "pending") return <Chip size="small" color="warning" variant="outlined" icon={<ClockIcon />} label={t("pending")} />;
  if (status === "unknown") return <Chip size="small" variant="outlined" icon={<InfoIcon />} label={t("unknown")} />;
  return <Chip size="small" color="error" variant="outlined" icon={<WarningIcon />} label={t("other", { raw: status })} />;
}

/** AD-06. Superadmin and finance only; support sees a one-line note. */
export function SmsCard({ canView, fromNumber, lowCreditRial }: { canView: boolean; fromNumber: string; lowCreditRial: number }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { handleError } = useAdmin();
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setFailed(false);
      try {
        setStatus(await api.admin.smsStatus(refresh));
      } catch (error) {
        if (!handleError(error)) setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  useEffect(() => {
    if (canView) void load(false);
  }, [canView, load]);

  if (!canView) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("admin.sms.noAccess")}
      </Typography>
    );
  }

  const otpStatus = status?.patterns["sms.pattern_otp"]?.status;
  let overall: { severity: "info" | "warning" | "error" | "success"; text: string; raw?: string };
  if (!status) overall = { severity: "info", text: failed ? t("admin.sms.unreachable") : t("admin.sms.checking") };
  else if (status.provider === "console") overall = { severity: "info", text: t("admin.sms.testMode") };
  else if (!status.configured) overall = { severity: "error", text: t("admin.sms.notConfigured") };
  else if (status.error) {
    const cause = status.error.startsWith("http_401") ? "401" : status.error.startsWith("http_422") ? "422" : "other";
    overall = { severity: "error", text: `${t("admin.sms.unreachable")} ${t(`admin.sms.cause.${cause}`)}`, raw: status.error };
  } else if (otpStatus !== "active") overall = { severity: "error", text: t("admin.sms.otpDown") };
  else if (status.low_credit) overall = { severity: "warning", text: t("admin.sms.lowCredit") };
  else overall = { severity: "success", text: t("admin.sms.ok") };

  // Console mode still reports real IPPanel data when a key is configured; show both.
  const secondaryOtpWarning = status?.provider === "console" && status.configured && otpStatus && otpStatus !== "active";

  return (
    <Paper variant="outlined" component="section" aria-labelledby="sms-card-title" sx={{ p: 2.5, mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, gap: 1, flexWrap: "wrap" }}>
        <Typography id="sms-card-title" variant="h6" component="h3">
          {t("admin.sms.title")}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => load(true)}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? t("admin.sms.checking") : t("admin.sms.checkNow")}
        </Button>
      </Stack>

      <Box aria-live="polite">
        <Alert severity={overall.severity} sx={{ mb: 1 }}>
          {overall.text}
          {overall.raw && (
            <Typography component="code" variant="caption" dir="ltr" sx={{ display: "block", fontFamily: "monospace" }}>
              {overall.raw}
            </Typography>
          )}
        </Alert>
        {secondaryOtpWarning && <Alert severity="warning" sx={{ mb: 1 }}>{t("admin.sms.otpDown")}</Alert>}
      </Box>

      {!status && loading ? (
        <Skeleton variant="rounded" height={120} />
      ) : (
        status && (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ my: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t("admin.sms.credit")}
                </Typography>
                <Typography variant="h6">
                  {status.credit_rial === null
                    ? "—"
                    : t("admin.settings.value.toman", { n: num(locale, Math.floor(status.credit_rial / 10)) })}
                </Typography>
                {status.credit_rial !== null && (
                  <Typography variant="body2" color="text.secondary">
                    {t("admin.sms.creditRial", { rial: num(locale, status.credit_rial) })}
                  </Typography>
                )}
                {status.gift_rial ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("admin.sms.gift", { amount: num(locale, Math.floor(status.gift_rial / 10)) })}
                  </Typography>
                ) : null}
                {status.low_credit && (
                  <Typography variant="body2" color="warning.main" sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                    <WarningIcon fontSize="small" />
                    {t("admin.sms.belowThreshold", { threshold: num(locale, Math.floor(lowCreditRial / 10)) })}
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t("admin.sms.sender")}
                </Typography>
                <Typography variant="h6" dir="ltr" sx={{ fontFamily: "monospace" }}>
                  {fromNumber}
                </Typography>
              </Box>
            </Stack>

            <Typography variant="subtitle2" component="h4" sx={{ mb: 1 }}>
              {t("admin.sms.patterns")}
            </Typography>
            {Object.keys(status.patterns).length === 0 ? (
              <Typography variant="body2">{t("admin.sms.noPatterns")}</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell scope="col">{t("admin.settings.col.setting")}</TableCell>
                      <TableCell scope="col">{t("admin.settings.col.current")}</TableCell>
                      <TableCell scope="col">{t("admin.settings.col.status")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(status.patterns).map(([key, p]) => (
                      <TableRow key={key}>
                        <TableCell component="th" scope="row">
                          <Typography variant="body2">{t(`admin.sms.pattern.${PURPOSE[key] ?? "otp"}`)}</Typography>
                          <Typography variant="caption" dir="ltr" sx={{ fontFamily: "monospace" }} color="text.secondary">
                            {key}
                          </Typography>
                        </TableCell>
                        <TableCell dir="ltr" sx={{ fontFamily: "monospace" }}>
                          {p.code}
                        </TableCell>
                        <TableCell>
                          <PatternStatusChip status={p.status} />
                          {p.status !== "active" && (
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                              {t(`admin.sms.consequence.${PURPOSE[key] ?? "otp"}`)}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
              {t("admin.sms.checkedAt", { time: dateTime(locale, status.checked_at) })}
            </Typography>
          </>
        )
      )}
    </Paper>
  );
}
