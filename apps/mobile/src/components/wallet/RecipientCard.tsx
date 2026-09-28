"use client";

import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { avatarSize, iconSize, radii } from "@bg/design-tokens";
import type { PublicUser } from "@bg/protocol";
import { SuccessIcon } from "@/components/icons";
import { Avatar } from "@/components/profile/Avatar";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";

// Transfer recipient card (wallet.md TR-01, TR-03): avatar, canonical username, and level under
// "Check the recipient". Found state = check icon + heading text, never color alone (P§13).
// Container query: avatar above the text when the card is narrow (xs, 200% text).

const Root = styled("section")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    containerType: "inline-size",
    padding: theme.spacing(2),
    borderRadius: radii.lg,
    border: `1px solid ${t.outline}`,
    backgroundColor: t.surface,
    "& .rc-row": { display: "flex", alignItems: "center", gap: theme.spacing(2) },
    "@container (max-width: 16rem)": { "& .rc-row": { flexDirection: "column", alignItems: "flex-start" } },
    "&[data-compact='true']": { padding: theme.spacing(1.5) },
  };
});

export function RecipientCard({ user, compact = false }: { user: PublicUser; compact?: boolean }) {
  const t = useTranslations("transfer.recipient");
  const f = useFormat();
  const headingId = useId();

  const identity = (
    <div className="rc-row">
      <Avatar avatarKey={user.avatar} size={compact ? avatarSize.sm : avatarSize.md} />
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="p" sx={{ overflowWrap: "anywhere" }}>
          <bdi dir="ltr">@{user.username}</bdi>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("level", { level: f.number(user.level) })}
        </Typography>
      </Stack>
    </div>
  );

  if (compact) return <Root data-compact="true">{identity}</Root>;

  return (
    <Root aria-labelledby={headingId}>
      <Stack spacing={1.5}>
        <Typography id={headingId} variant="h5" component="h2" sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
          <SuccessIcon sx={{ fontSize: iconSize.sm, color: "tokens.success", flex: "none" }} />
          {t("checkTitle")}
        </Typography>
        {identity}
        <Typography variant="body2" color="text.secondary">
          {t("checkBody")}
        </Typography>
      </Stack>
    </Root>
  );
}
