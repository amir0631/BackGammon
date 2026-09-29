"use client";

import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import { iconSize, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { SessionInfo } from "@bg/protocol";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/Toast";
import { ActionButton } from "@/components/forms/ActionButton";
import { CheckIcon, DevicesIcon, InfoIcon } from "@/components/icons";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { toApiError } from "@/lib/apiErrors";
import { deviceParts } from "@/lib/deviceLabel";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { tokensOf } from "@/theme/theme";

// AC-04 Signed-in devices `/me/sessions` and AC-06 (profile.md §3.4, §4). This device first, then
// the others by last activity. One action signs out every other device (the API has no
// per-device sign-out). Never shows IP addresses or tokens.

const List = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    "& > li": { display: "flex", gap: theme.spacing(1.5), padding: theme.spacing(2), alignItems: "flex-start" },
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

function sortSessions(rows: SessionInfo[]): SessionInfo[] {
  return [...rows].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime();
  });
}

export function SessionsScreen() {
  const t = useTranslations();
  const f = useFormat();
  const toast = useToast();
  const online = useOnline();

  const [rows, setRows] = useState<SessionInfo[] | null>(null);
  const [loadError, setLoadError] = useState<{ offline: boolean; code?: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [dialogError, setDialogError] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    api.me
      .sessions()
      .then((res) => setRows(sortSessions(res.results)))
      .catch((error) => {
        const e = toApiError(error);
        setLoadError({ offline: e.code === "NETWORK", code: e.code === "NETWORK" ? undefined : e.code });
      });
  }, []);

  useEffect(load, [load]);

  const others = rows?.filter((r) => !r.current).length ?? 0;

  const signOutOthers = async () => {
    setInFlight(true);
    setDialogError(false);
    try {
      const res = await api.me.signOutOthers();
      setDialogOpen(false);
      toast.show({ message: t("sessions.done", { count: res.revoked }) });
      load();
    } catch {
      setDialogError(true);
    } finally {
      setInFlight(false);
    }
  };

  const label = (s: SessionInfo) => {
    const parts = deviceParts(s.user_agent);
    return parts ? t("sessions.device", { browser: isolate(parts.browser), os: isolate(parts.os) }) : t("sessions.unknownDevice");
  };

  return (
    <DetailColumns>
      <Stack spacing={3} className="detail-main">
        <Typography color="text.secondary">{t("sessions.intro")}</Typography>
        {rows && (
          <Stack spacing={1.5}>
            {others > 0 ? (
              <ActionButton
                variant="outlined"
                onClick={() => setDialogOpen(true)}
                disabledReason={!online ? t("net.offlineAction") : null}
              >
                {t("sessions.signOutOthers")}
              </ActionButton>
            ) : (
              <Typography variant="body2" sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}>
                <CheckIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25, color: "tokens.success" }} />
                <span>{t("sessions.noOthers")}</span>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}>
              <InfoIcon sx={{ fontSize: iconSize.sm, flex: "none", mt: 0.25 }} />
              <span>
                {t.rich("sessions.safety", {
                  link: (chunks) => (
                    <Link component={NextLink} href="/password/reset?next=%2Fme%2Fsessions">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </Typography>
          </Stack>
        )}

        {loadError ? (
          <ErrorState
            kind={loadError.offline ? "offline" : "error"}
            message={loadError.offline ? t("net.offline") : t("sessions.loadError")}
            code={loadError.code}
            onRetry={load}
          />
        ) : rows === null ? (
          <LoadingState variant="list" rows={3} />
        ) : (
          <List>
            {rows.map((s) => (
              <li key={s.id} tabIndex={0}>
                <DevicesIcon sx={{ color: "text.secondary", flex: "none", mt: 0.25 }} />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                    <Typography variant="body1" component="p" sx={{ fontWeight: 600 }}>
                      {label(s)}
                    </Typography>
                    {s.current && (
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        icon={<CheckIcon sx={{ fontSize: iconSize.sm }} />}
                        label={t("sessions.thisDevice")}
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t("sessions.lastActive", { time: `${f.relative(s.last_used_at)} · ${f.dateTime(s.last_used_at)}` })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("sessions.signedIn", { date: f.date(s.created_at) })}
                  </Typography>
                </Stack>
              </li>
            ))}
          </List>
        )}
      </Stack>

      <ConfirmDialog
        open={dialogOpen}
        onCancel={() => {
          setDialogOpen(false);
          setDialogError(false);
        }}
        onConfirm={() => void signOutOthers()}
        title={t("sessions.dialog.title")}
        confirmLabel={t("sessions.dialog.confirm")}
        inFlight={inFlight}
        inFlightLabel={t("sessions.signingOut")}
        error={dialogError ? t("sessions.dialog.failed") : null}
        disabledReason={!online ? t("net.offlineAction") : null}
      >
        {t("sessions.dialog.body")}
      </ConfirmDialog>
    </DetailColumns>
  );
}
