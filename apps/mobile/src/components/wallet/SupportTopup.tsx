"use client";

import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { iconSize, radii } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import { LockIcon, SendIcon, SupportIcon } from "@/components/icons";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { CopyButton } from "./CopyButton";
import { InfoLine } from "./InfoLine";
import { usePublicConfig } from "@/lib/config";

// "Get coins" while online purchase is unavailable (wallet.md §3.3, WA-04; journeys.md J3a;
// CLAUDE.md §7.9, §7.11). Shared with the step-9 coins page (CO-02) so the wording stays one.
// Neutral copy only: no urgency, no suggested amount, no package (P§9). The phone number is never
// shown or asked for; the user identifies themselves to support by username.

const Well = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surfaceSunken,
  };
});

const ValueRow = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(0.5, 1),
  "& .value": { flex: "1 1 8rem", minWidth: 0, overflowWrap: "anywhere" },
}));

/** A support channel is a link when it is a URL, an email, or a phone number; otherwise text. */
function channelHref(channel: string): string | null {
  const c = channel.trim();
  if (/^https?:\/\//i.test(c)) return c;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  if (/^\+?[0-9][0-9\s-]{5,}$/.test(c)) return `tel:${c.replace(/[\s-]/g, "")}`;
  return null;
}

export interface SupportTopupContentProps {
  username: string | null;
  /** `coin_price_toman` from the server; the rate line waits for it. */
  coinPriceToman: number | null;
}

export function SupportTopupContent({ username, coinPriceToman }: SupportTopupContentProps) {
  const t = useTranslations("shop.coins.supportTopup");
  const tSupport = useTranslations("support.contact");
  const f = useFormat();
  // No configured channel: one neutral sentence, no channel line and nothing to copy (W-23).
  const channel = usePublicConfig()?.support_contact?.trim() || null;
  const href = channel ? channelHref(channel) : null;

  return (
    <Stack spacing={2.5}>
      <InfoLine tone="primary">{t("status")}</InfoLine>
      {coinPriceToman !== null && (
        <Typography variant="body1" component="p">
          {t("rate", { price: f.number(coinPriceToman) })}
        </Typography>
      )}

      <Stack spacing={1} component="section" aria-labelledby="topup-how">
        <Typography id="topup-how" variant="h5" component="h3" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <SupportIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.primary" }} />
          {t("howTitle")}
        </Typography>
        <Well>
          {channel ? (
            <ValueRow>
              <Typography variant="body2" className="value">
                {t.rich("how", {
                  channel: isolate(channel),
                  link: (chunks) =>
                    href ? (
                      <Link href={href} dir="ltr" sx={{ overflowWrap: "anywhere" }}>
                        {chunks}
                      </Link>
                    ) : (
                      <bdi dir="ltr">{chunks}</bdi>
                    ),
                })}
              </Typography>
              <CopyButton value={channel} label={t("copyChannel")} />
            </ValueRow>
          ) : (
            <Typography variant="body2">{tSupport("neutral")}</Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {t("tell")}
          </Typography>
          {username && (
            <ValueRow>
              <Typography variant="body1" className="value" sx={{ fontWeight: 600 }}>
                {t("username", { username: isolate(username) })}
              </Typography>
              <CopyButton value={username} label={t("copyUsername")} />
            </ValueRow>
          )}
        </Well>
      </Stack>

      <Stack spacing={1} component="section" aria-labelledby="topup-other">
        <Typography id="topup-other" variant="h5" component="h3">
          {t("otherTitle")}
        </Typography>
        {/* Only ways that exist in the current step (wallet.md §3.3 item 5). */}
        <InfoLine icon={SendIcon}>{t("other.transfer")}</InfoLine>
      </Stack>

      <InfoLine icon={LockIcon}>{t("safety")}</InfoLine>
    </Stack>
  );
}

