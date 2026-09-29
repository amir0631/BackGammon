"use client";

import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { iconSize, layout, radii } from "@bg/design-tokens";
import type { Tier } from "@bg/protocol";
import { ChevronForwardIcon, CoinIcon } from "@/components/icons";
import { BotIcon } from "@/components/icons/game";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// PL-05 options (play.md §3.7, P§9.1), in this order: affordable lower tiers, practice vs bot, and
// "Get coins" as a text action. The `afterLoss` variant (match.md MA-13b) never renders the shop
// option (P§9: no purchase prompt after a loss).

const Row = styled(ButtonBase)(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: theme.spacing(1.5),
    minHeight: layout.listRowMinHeight,
    padding: theme.spacing(1.25, 2),
    borderRadius: radii.md,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    textAlign: "start",
    "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  };
}) as typeof ButtonBase;

export interface InsufficientOptionsProps {
  tiers: readonly Tier[];
  /** The entry that could not be paid; only cheaper tiers are offered. */
  entry: number;
  balance: number | null;
  onTier: (tier: Tier) => void;
  onBot: () => void;
  /** Omit after a loss (no shop link, P§9). */
  onGetCoins?: () => void;
}

export function InsufficientOptions({ tiers, entry, balance, onTier, onBot, onGetCoins }: InsufficientOptionsProps) {
  const t = useTranslations();
  const f = useFormat();
  const lower = balance === null ? [] : tiers.filter((tier) => tier.entry < entry && tier.entry <= balance);

  return (
    <Stack spacing={1} component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
      {lower.map((tier) => (
        <li key={tier.id}>
          <Row onClick={() => onTier(tier)}>
            <CoinIcon sx={{ fontSize: iconSize.md, flex: "none" }} />
            <Typography variant="body1" component="span" sx={{ flex: "1 1 auto", minWidth: 0 }}>
              {t("play.insufficient.lowerTier", { entry: f.number(tier.entry), payout: f.number(tier.payout) })}
            </Typography>
            <ChevronForwardIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />
          </Row>
        </li>
      ))}
      <li>
        <Row onClick={onBot}>
          <BotIcon sx={{ fontSize: iconSize.md, flex: "none" }} />
          <Typography variant="body1" component="span" sx={{ flex: "1 1 auto", minWidth: 0 }}>
            {t("play.insufficient.bot")}
          </Typography>
          <ChevronForwardIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />
        </Row>
      </li>
      {onGetCoins && (
        <li>
          <Button variant="text" onClick={onGetCoins} sx={{ alignSelf: "flex-start" }}>
            {t("coins.getCoins")}
          </Button>
        </li>
      )}
    </Stack>
  );
}
