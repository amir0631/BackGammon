"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api, earningDisplay, groupByDay, localDay, referralRules, type ReferralRule } from "@bg/api-client";
import { feedbackTiming, minTouchTarget, radii } from "@bg/design-tokens";
import { formatPercent, isolate } from "@bg/i18n";
import type { ReferralEarningRow, ReferralSummary } from "@bg/protocol";
import { CheckIcon, ClockIcon, CloseIcon, CopyIcon, InfoIcon, SendIcon } from "@/components/icons";
import { StatusChip } from "@/components/lists/StatusChip";
import { DetailColumns } from "@/components/profile/AccountLayout";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { InfoLine } from "@/components/wallet/InfoLine";
import { toApiError } from "@/lib/apiErrors";
import { usePublicConfig } from "@/lib/config";
import { useSession } from "@/lib/session";
import { readJson, writeJson } from "@/lib/storage";
import { useFormat } from "@/lib/useFormat";
import { useOnline } from "@/lib/useOnline";
import { visuallyHidden } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// RF-01 Invite friends `/me/referral` and RF-02 share fallback (referral.md §3–§4). The link and the
// rules come from `GET me/referral` (never a hardcoded percent); earnings from
// `GET me/referral/earnings` with a status chip per row. Rows don't link anywhere (a friend's match
// is theirs). Share uses the Web Share API when present; a cancelled share is silent.

interface Cache {
  userId: number;
  summary: ReferralSummary;
  rows: ReferralEarningRow[];
  next: string | null;
  at: number;
}

const CACHE_KEY = "bg.referral.cache";
const hintKey = (userId: number) => `bg.referral.hintSeen.${userId}`;

const Card = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "grid",
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    minWidth: 0,
    containerType: "inline-size",
    "& .copy-row": { display: "grid", gap: theme.spacing(1), gridTemplateColumns: "1fr 1fr" },
    "@container (max-width: 20rem)": { "& .copy-row": { gridTemplateColumns: "1fr" } },
  };
});

const Columns = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  containerType: "inline-size",
  "& > .col": { display: "grid", gap: theme.spacing(2), alignContent: "start", minWidth: 0 },
}));

const Rows = styled("ul")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    "& > li": { minHeight: 56, padding: theme.spacing(1.25, 2), display: "grid", gap: theme.spacing(0.5) },
    "& > li + li": { borderBlockStart: `1px solid ${t.outlineSubtle}` },
  };
});

/** Copy with a visible "Copied" for a moment and a polite announcement (wallet.md §8). */
function CopyAction({ value, label }: { value: string; label: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), feedbackTiming.toastMs);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <Button
        variant="outlined"
        fullWidth
        startIcon={copied ? <CheckIcon /> : <CopyIcon />}
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined)
        }
        sx={{ minHeight: minTouchTarget }}
      >
        {copied ? t("copied") : label}
      </Button>
      <span role="status" style={visuallyHidden}>
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}

export function ReferralScreen() {
  const t = useTranslations();
  const f = useFormat();
  const online = useOnline();
  const config = usePublicConfig();
  const { me } = useSession();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [summaryError, setSummaryError] = useState<{ offline: boolean; code?: string } | null>(null);
  const [rows, setRows] = useState<ReferralEarningRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [rowsError, setRowsError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [hintSeen, setHintSeen] = useState(true);

  const load = useCallback(() => {
    setSummaryError(null);
    setRowsError(false);
    const cache = readJson<Cache>("local", CACHE_KEY);
    const own = cache && me && cache.userId === me.id ? cache : null;
    Promise.allSettled([api.referral.get(), api.referral.earnings()]).then(([s, e]) => {
      if (s.status === "fulfilled") {
        setSummary(s.value);
        setCachedAt(null);
      } else {
        const err = toApiError(s.reason);
        if (err.code === "NETWORK" && own) {
          setSummary(own.summary);
          setRows(own.rows);
          setNext(own.next);
          setCachedAt(own.at);
          return;
        }
        setSummaryError({ offline: err.code === "NETWORK", code: err.code === "NETWORK" ? undefined : err.code });
      }
      if (e.status === "fulfilled") {
        setRows(e.value.results);
        setNext(e.value.next);
      } else setRowsError(true);
      if (s.status === "fulfilled" && e.status === "fulfilled" && me) {
        writeJson("local", CACHE_KEY, { userId: me.id, summary: s.value, rows: e.value.results, next: e.value.next, at: Date.now() } satisfies Cache);
      }
    });
  }, [me]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!me) return;
    setHintSeen(Boolean(readJson<boolean>("local", hintKey(me.id))));
    writeJson("local", hintKey(me.id), true);
  }, [me]);

  const reloadRows = () => {
    setRowsError(false);
    api.referral
      .earnings()
      .then((page) => {
        setRows(page.results);
        setNext(page.next);
      })
      .catch(() => setRowsError(true));
  };

  const more = () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    api.referral
      .earnings(next)
      .then((page) => {
        setRows((r) => [...(r ?? []), ...page.results]);
        setNext(page.next);
      })
      .catch(() => setMoreError(true))
      .finally(() => setLoadingMore(false));
  };

  const appName = config?.app_name || t("app.name");
  const link = summary?.link ?? "";
  const code = summary?.code ?? "";

  const share = async () => {
    const text = t("referral.share.text", { app: appName, url: link });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: t("referral.share.title", { app: appName }), text, url: link });
      } catch {
        // Cancelled or refused: nothing to say (referral.md §3.2 step 1).
      }
      return;
    }
    setShareOpen(true);
  };

  const ruleText = (r: ReferralRule): string => {
    switch (r.key) {
      case "entry":
      case "pot":
        return t(`referral.rules.${r.key}`, { pct: formatPercent(f.locale, r.pct / 100, 2) });
      case "days":
        return t("referral.rules.days", { days: r.days });
      default:
        return t(`referral.rules.${r.key}`);
    }
  };

  if (summaryError) {
    return (
      <DetailColumns>
        <Box className="detail-main">
          <ErrorState kind={summaryError.offline ? "offline" : "error"} message={summaryError.offline ? t("net.offline") : t("referral.loadError")} code={summaryError.code} onRetry={load} />
        </Box>
      </DetailColumns>
    );
  }

  const inviteCard = (
    <Card aria-labelledby="rf-invite">
      <Typography id="rf-invite" variant="h4" component="h2">
        {t("referral.link.heading")}
      </Typography>
      {summary === null ? (
        <Stack spacing={1} aria-busy="true">
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rounded" height={48} />
        </Stack>
      ) : !code ? (
        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Typography>{t("referral.noCode")}</Typography>
          <Button variant="outlined" component={NextLink} href="/me/edit">
            {t("profile.hub.editProfile")}
          </Button>
        </Stack>
      ) : (
        <>
          <Box
            tabIndex={0}
            aria-label={t("referral.link.label", { url: link })}
            sx={{ p: 1.5, borderRadius: `${radii.md}px`, bgcolor: "tokens.surfaceSunken", border: 1, borderColor: "tokens.outlineSubtle", minWidth: 0 }}
          >
            <Typography component="bdi" dir="ltr" variant="body2" sx={{ display: "block", overflowWrap: "anywhere", wordBreak: "break-all", fontFamily: "inherit" }} aria-hidden>
              {link}
            </Typography>
          </Box>
          <Typography variant="body2">
            {t("referral.code", { code: isolate(code) })}
          </Typography>
          <Button variant="contained" size="large" fullWidth startIcon={<SendIcon />} onClick={() => void share()} sx={{ minHeight: 48 }}>
            {t("referral.shareAction")}
          </Button>
          <div className="copy-row">
            <CopyAction value={link} label={t("referral.copyLink")} />
            <CopyAction value={code} label={t("referral.copyCode")} />
          </div>
        </>
      )}
    </Card>
  );

  const rulesCard = (
    <Card aria-labelledby="rf-rules">
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography id="rf-rules" variant="h5" component="h2">
          {t("referral.rules.title")}
        </Typography>
      </Stack>
      {summary === null ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="text" />
          ))}
        </Stack>
      ) : (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
          {referralRules(summary).map((r) => (
            <InfoLine key={r.key} component="li" icon={InfoIcon}>
              {ruleText(r)}
            </InfoLine>
          ))}
        </Stack>
      )}
    </Card>
  );

  const summaryCard = summary && (
    <Card aria-label={t("referral.earnings.title")}>
      {summary.referees > 0 ? (
        <Typography variant="body1">{t("referral.summary.friends", { referees: summary.referees, active: summary.active_referees })}</Typography>
      ) : (
        <Typography variant="body1">{t("referral.summary.noFriends")}</Typography>
      )}
      <Typography variant="body1">{t("referral.summary.earned", { earned: f.number(summary.earned), commissions: summary.commissions })}</Typography>
      {summary.held > 0 && <InfoLine icon={ClockIcon}>{t("referral.summary.held", { held: f.number(summary.held) })}</InfoLine>}
    </Card>
  );

  const today = localDay(new Date().toISOString());
  const yesterday = localDay(new Date(Date.now() - 86_400_000).toISOString());
  const dayTitle = (day: string, iso: string) =>
    day === today ? t("wallet.history.today") : day === yesterday ? t("wallet.history.yesterday") : f.date(iso, { day: "numeric", month: "long", year: "numeric" });

  const earningRow = (r: ReferralEarningRow) => {
    const d = earningDisplay(r);
    const statusText = d.status ? t(`referral.status.${d.status}`) : "";
    const date = f.dateTime(r.created_at);
    const amount = d.signed ? `+${f.number(r.amount)}` : f.number(r.amount);
    return (
      <li key={r.id} aria-label={t("referral.row.label", { username: isolate(r.referee ?? "?"), date, amount: f.number(r.amount), status: statusText })}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 1.5, flexWrap: "wrap" }} aria-hidden>
          <Typography variant="label" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {r.referee ? t("referral.earnings.friend", { username: isolate(r.referee) }) : "—"}
          </Typography>
          <Typography variant="label" sx={{ fontVariantNumeric: "tabular-nums", textDecoration: d.struck ? "line-through" : undefined }}>
            <bdi>{amount}</bdi>
            {d.struck && (
              <Box component="span" sx={{ textDecoration: "none", display: "inline-block", marginInlineStart: 0.5 }}>
                {t("referral.status.cancelled")}
              </Box>
            )}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }} aria-hidden>
          <Typography variant="caption" color="text.secondary">
            {date}
          </Typography>
          {d.status && (
            <StatusChip icon={d.status === "paid" ? CheckIcon : d.status === "held" ? ClockIcon : CloseIcon} tone={d.status === "paid" ? "success" : d.status === "held" ? "info" : "neutral"}>
              {statusText}
            </StatusChip>
          )}
        </Stack>
        {d.note && (
          <Typography variant="caption" color="text.secondary" aria-hidden>
            {t(`referral.status.${d.note}`)}
          </Typography>
        )}
      </li>
    );
  };

  const earnings = (
    <section aria-labelledby="rf-earnings">
      <Typography id="rf-earnings" variant="h5" component="h2" sx={{ mb: 1.5 }}>
        {t("referral.earnings.title")}
      </Typography>
      {rowsError ? (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
            {t("referral.earnings.loadError")}
          </Typography>
          <Button variant="outlined" onClick={reloadRows}>
            {t("common.retry")}
          </Button>
        </Stack>
      ) : rows === null ? (
        <LoadingState variant="list" rows={5} />
      ) : rows.length === 0 ? (
        <Stack spacing={1.5}>
          <EmptyState message={t("referral.empty")} />
          {link && <CopyAction value={link} label={t("referral.copyLink")} />}
        </Stack>
      ) : (
        <Stack spacing={2}>
          {groupByDay(rows).map((g) => (
            <div key={g.day}>
              <Typography variant="labelSmall" component="h3" color="text.secondary" sx={{ mb: 1 }}>
                {dayTitle(g.day, g.rows[0]!.created_at)}
              </Typography>
              <Rows>{g.rows.map(earningRow)}</Rows>
            </div>
          ))}
          {moreError && (
            <Typography role="alert" variant="body2" sx={{ color: "tokens.error" }}>
              {t("referral.earnings.loadError")}
            </Typography>
          )}
          {next && (
            <Box>
              <Button variant="outlined" fullWidth loading={loadingMore} onClick={more} disabled={!online}>
                {moreError ? t("common.retry") : t("common.showMore")}
              </Button>
              {!online && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
                  {t("net.offlineAction")}
                </Typography>
              )}
            </Box>
          )}
        </Stack>
      )}
    </section>
  );

  return (
    <Box sx={{ containerType: "inline-size", containerName: "referral" }}>
      <Stack spacing={2}>
        {cachedAt !== null && (
          <Typography variant="body2" color="text.secondary">
            {t("common.lastUpdated", { time: f.dateTime(new Date(cachedAt)) })}
          </Typography>
        )}
        {!hintSeen && <InfoLine icon={InfoIcon} tone="primary">{t("referral.hint.firstVisit")}</InfoLine>}
        <Columns
          sx={{
            gridTemplateColumns: "minmax(0, 1fr)",
            "@container referral (min-width: 44rem)": { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" },
          }}
        >
          <div className="col">
            {inviteCard}
            {rulesCard}
          </div>
          <div className="col">
            {summaryCard}
            {earnings}
          </div>
        </Columns>
      </Stack>

      <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title={t("referral.shareSheet.title")}>
        <Stack spacing={1.5}>
          <Box sx={{ p: 1.5, borderRadius: `${radii.md}px`, bgcolor: "tokens.surfaceSunken", border: 1, borderColor: "tokens.outlineSubtle" }}>
            <Typography component="bdi" dir="ltr" variant="body2" sx={{ display: "block", overflowWrap: "anywhere", wordBreak: "break-all", userSelect: "all" }}>
              {link}
            </Typography>
          </Box>
          <CopyAction value={link} label={t("referral.copyLink")} />
          <CopyAction value={code} label={t("referral.copyCode")} />
          <Button variant="text" onClick={() => setShareOpen(false)}>
            {t("common.close")}
          </Button>
        </Stack>
      </BottomSheet>
    </Box>
  );
}
