"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { avatarSize, iconSize, minTouchTarget, radii } from "@bg/design-tokens";
import type { LeaderboardRow, Tier } from "@bg/protocol";
import { CoinIcon, InfoIcon } from "@/components/icons";
import { BotIcon, RatedIcon } from "@/components/icons/game";
import { Avatar } from "@/components/profile/Avatar";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// PL-01 cards (play.md §4). The rank card links to `/leaderboard` (leaderboard.md §2). A tier card is one focus stop whose accessible name is `play.tier.label`;
// its "Play" pill is part of the card (the card is the action). Unaffordable cards say so with an
// icon and text but stay tappable (PL-05 explains). Coin tables and practice have equal weight.

export const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    padding: theme.spacing(2),
    containerType: "inline-size",
  };
});

const TierButton = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    width: "100%",
    height: "100%",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    textAlign: "start",
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
    "&[aria-disabled='true']": { cursor: "not-allowed" },
    "& .tier-pill": {
      flex: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: minTouchTarget,
      minWidth: minTouchTarget + 20,
      paddingInline: theme.spacing(2),
      borderRadius: radii.md,
      backgroundColor: t.primary,
      color: t.onPrimary,
      ...theme.typography.label,
    },
    "&[aria-disabled='true'] .tier-pill": {
      backgroundColor: theme.vars?.palette.action.disabledBackground,
      color: t.textDisabled,
    },
    // xs, 4-up grids, and 200% text: the pill drops under the text. The container is the card's
    // wrapper (a query never measures the element it styles).
    "@container tiercard (max-width: 17rem)": { flexWrap: "wrap", "& .tier-pill": { width: "100%" } },
  };
}) as typeof ButtonBase;

export interface TierCardProps {
  tier: Tier;
  affordable: boolean;
  /** Id of the visible reason all play buttons are blocked (unsupported, suspended, in match, offline). */
  blockedBy: string | null;
  onOpen: () => void;
}

export function TierCard({ tier, affordable, blockedBy, onOpen }: TierCardProps) {
  const t = useTranslations("play");
  const f = useFormat();
  const waiting = tier.waiting > 0 ? t("tier.waiting", { count: tier.waiting }) : "";
  return (
    <TierButton
      onClick={() => {
        if (!blockedBy) onOpen();
      }}
      aria-disabled={blockedBy ? true : undefined}
      aria-describedby={blockedBy ?? undefined}
      aria-label={t("tier.label", { entry: f.number(tier.entry), payout: f.number(tier.payout), waiting })}
    >
      <CoinIcon sx={{ fontSize: iconSize.lg, flex: "none" }} />
      <Box sx={{ flex: "1 1 10rem", minWidth: 0 }} aria-hidden>
        <Typography variant="h4" component="p">
          {t("tier.name", { entry: f.number(tier.entry) })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("tier.payout", { payout: f.number(tier.payout) })}
        </Typography>
        {tier.waiting > 0 && (
          <Typography variant="caption" color="text.secondary" component="p">
            {waiting}
          </Typography>
        )}
        {!affordable && (
          <Typography variant="caption" component="p" sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "tokens.warning" }}>
            <InfoIcon sx={{ fontSize: iconSize.sm }} />
            {t("tier.needs", { entry: f.number(tier.entry) })}
          </Typography>
        )}
      </Box>
      <span className="tier-pill" aria-hidden>
        {t("tier.play")}
      </span>
    </TierButton>
  );
}

export function TierCardSkeleton() {
  return <Skeleton variant="rectangular" height="6.5rem" sx={{ borderRadius: `${radii.lg}px` }} />;
}

export function PracticeCard({ blockedBy, onOpen, entry = 0 }: { blockedBy: string | null; onOpen: () => void; entry?: number }) {
  const t = useTranslations("play");
  const f = useFormat();
  return (
    <Card>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <BotIcon sx={{ fontSize: iconSize.md }} />
          <Typography variant="h4" component="h2">
            {t("practice.title")}
          </Typography>
          <Box
            component="span"
            sx={{ typography: "labelSmall", px: 1, borderRadius: `${radii.pill}px`, border: 1, borderColor: "tokens.outline" }}
          >
            {t("bot.label")}
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {entry > 0 ? t("practice.descPaid", { entry: f.number(entry) }) : t("practice.desc")}
        </Typography>
        <Button
          variant="outlined"
          size="large"
          startIcon={<BotIcon />}
          onClick={() => {
            if (!blockedBy) onOpen();
          }}
          aria-disabled={blockedBy ? true : undefined}
          aria-describedby={blockedBy ?? undefined}
          sx={blockedBy ? { color: "text.disabled", borderColor: "tokens.outlineSubtle", cursor: "not-allowed" } : undefined}
        >
          {t("practice.button")}
        </Button>
      </Stack>
    </Card>
  );
}

export function RankCard({ elo, level, children }: { elo: number | null; level: number | null; children?: ReactNode }) {
  const t = useTranslations("play.rank");
  const tCommon = useTranslations("common");
  const f = useFormat();
  return (
    <Card>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <RatedIcon sx={{ fontSize: iconSize.md }} />
          <Typography variant="h4" component="h2">
            {t("title")}
          </Typography>
        </Stack>
        {elo === null || level === null ? (
          <Skeleton variant="text" width="60%" />
        ) : (
          <Typography variant="body1">
            {t("elo", { elo: f.number(elo) })}
            {tCommon("listSep")}
            {t("level", { level: f.number(level) })}
          </Typography>
        )}
        {children}
        <Button variant="text" component={NextLink} href="/leaderboard" sx={{ alignSelf: "flex-start", minHeight: minTouchTarget }}>
          {t("leaderboard")}
        </Button>
      </Stack>
    </Card>
  );
}

/** lg context panel: top 5 of the all-time board (play.md §6). */
export function TopPlayers({ rows }: { rows: LeaderboardRow[] | null }) {
  const t = useTranslations("play.rank");
  const f = useFormat();
  return (
    <Stack spacing={1} component="section" aria-labelledby="top-players">
      <Typography id="top-players" variant="labelSmall" component="h3" color="text.secondary">
        {t("top")}
      </Typography>
      {rows === null ? (
        <Skeleton variant="rectangular" height="8rem" sx={{ borderRadius: `${radii.md}px` }} />
      ) : (
        <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
          {rows.slice(0, 5).map((row) => (
            <Box component="li" key={row.rank} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="label" sx={{ minWidth: "1.5rem", fontVariantNumeric: "tabular-nums" }}>
                {f.number(row.rank)}
              </Typography>
              <Avatar avatarKey={row.avatar} size={avatarSize.sm - 8} />
              <Typography variant="body2" sx={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                <bdi dir="ltr">{row.username ?? ""}</bdi>
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {f.number(row.value)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}

export function PlayAgainCard({ summary, onOpen, blockedBy }: { summary: string; onOpen: () => void; blockedBy: string | null }) {
  const t = useTranslations("play");
  return (
    <Card>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ flex: "1 1 12rem", minWidth: 0 }}>
          <Typography variant="h5" component="h2">
            {t("again.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {summary}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => {
            if (!blockedBy) onOpen();
          }}
          aria-disabled={blockedBy ? true : undefined}
          aria-describedby={blockedBy ?? undefined}
          aria-label={t("again.label", { summary })}
          sx={blockedBy ? { bgcolor: "action.disabledBackground", color: "text.disabled", cursor: "not-allowed" } : undefined}
        >
          {t("tier.play")}
        </Button>
      </Stack>
    </Card>
  );
}
