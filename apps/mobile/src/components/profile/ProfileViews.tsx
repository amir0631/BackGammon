"use client";

import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { avatarSize, radii } from "@bg/design-tokens";
import type { Me, PublicUser } from "@bg/protocol";
import { EditIcon } from "@/components/icons";
import { useFormat } from "@/lib/useFormat";
import { tokensOf } from "@/theme/theme";
import { Avatar } from "./Avatar";

// Identity views (profile.md): the hub's profile card (AC-01) and the public profile (AC-05), which
// also serves as the own-profile preview in the account list-detail layout. Usernames are always
// LTR-isolated; numbers use locale digits. Never shows a phone number or account status.

const CardRoot = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    borderRadius: radii.lg,
    border: `1px solid ${t.outlineSubtle}`,
    backgroundColor: t.surface,
    overflow: "hidden",
    containerType: "inline-size",
  };
});

const CardLink = styled(ButtonBase)(({ theme }) => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  textAlign: "start",
  "@media (hover: hover)": { "&:hover": { backgroundColor: theme.vars?.palette.action.hover } },
  "&.Mui-focusVisible": { outlineOffset: -2 },
  // Narrow cards (xs, 200% text): avatar above the text.
  "@container (max-width: 17rem)": { flexDirection: "column", alignItems: "flex-start" },
})) as typeof ButtonBase;

export function Username({ name }: { name: string | null | undefined }) {
  const t = useTranslations("profile.hub");
  if (!name) return <>{t("noUsername")}</>;
  return <bdi dir="ltr">{name}</bdi>;
}

/** AC-01 profile card: avatar, username, level, ELO; the card opens the own public profile. */
export function ProfileCard({ me }: { me: Me | null }) {
  const t = useTranslations("profile.hub");
  const f = useFormat();
  return (
    <CardRoot>
      {me ? (
        <CardLink
          component={NextLink}
          href={me.username ? `/profile/${encodeURIComponent(me.username)}` : "/me/edit"}
        >
          <Avatar avatarKey={me.avatar} size={avatarSize.md} />
          <span style={{ minWidth: 0 }}>
            <Typography variant="h4" component="span" sx={{ display: "block", overflowWrap: "anywhere" }}>
              <Username name={me.username} />
            </Typography>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
              {t("level", { level: f.number(me.level) })} · {t("elo", { elo: f.number(me.elo) })}
            </Typography>
            <Typography variant="labelSmall" color="primary" component="span" sx={{ display: "block", mt: 0.5, textDecoration: "underline" }}>
              {t("viewProfile")}
            </Typography>
          </span>
        </CardLink>
      ) : (
        <Stack direction="row" spacing={2} sx={{ p: 2, alignItems: "center" }} aria-hidden>
          <Skeleton variant="circular" width={avatarSize.md} height={avatarSize.md} />
          <div style={{ flex: 1 }}>
            <Skeleton variant="text" width="50%" sx={{ typography: "h4" }} />
            <Skeleton variant="text" width="70%" sx={{ typography: "body2" }} />
          </div>
        </Stack>
      )}
      <Stack direction="row" sx={{ borderBlockStart: 1, borderColor: "divider", px: 1, py: 0.5 }}>
        <Button component={NextLink} href="/me/edit" startIcon={<EditIcon />} variant="text">
          {t("editProfile")}
        </Button>
      </Stack>
    </CardRoot>
  );
}

const Stat = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    padding: theme.spacing(1.5, 2),
    borderRadius: radii.md,
    backgroundColor: t.surfaceSunken,
    minWidth: 0,
  };
});

const StatGrid = styled("dl")(({ theme }) => ({
  margin: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))",
  gap: theme.spacing(1),
  "& dd": { margin: 0 },
}));

export interface PublicProfileViewProps {
  user: PublicUser;
  /** Heading level: h1 on the profile route, h2 inside the account preview. */
  headingComponent?: "h1" | "h2";
  note?: ReactNode;
  actions?: ReactNode;
}

/** AC-05 content: avatar, username, level, ELO, member since. Shows only what the API returns. */
export function PublicProfileView({ user, headingComponent = "h1", note, actions }: PublicProfileViewProps) {
  const t = useTranslations("publicProfile");
  const f = useFormat();
  return (
    <Stack spacing={3}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <Avatar avatarKey={user.avatar} size={avatarSize.lg} />
        <div>
          <Typography variant="h2" component={headingComponent} sx={{ overflowWrap: "anywhere" }}>
            <bdi dir="ltr">{user.username}</bdi>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("memberSince", { date: f.monthYear(user.created_at) })}
          </Typography>
        </div>
      </Stack>
      <StatGrid>
        <Stat>
          <Typography component="dt" variant="labelSmall" color="text.secondary">
            {t("level")}
          </Typography>
          <Typography component="dd" variant="h3" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {f.number(user.level)}
          </Typography>
        </Stat>
        <Stat>
          <Typography component="dt" variant="labelSmall" color="text.secondary">
            {t("elo")}
          </Typography>
          <Typography component="dd" variant="h3" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {f.number(user.elo)}
          </Typography>
        </Stat>
      </StatGrid>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          {note}
        </Typography>
      )}
      {actions}
    </Stack>
  );
}

export function PublicProfileSkeleton() {
  return (
    <Stack spacing={3} sx={{ alignItems: "center" }} aria-hidden>
      <Skeleton variant="circular" width={avatarSize.lg} height={avatarSize.lg} />
      <Skeleton variant="text" width="40%" sx={{ typography: "h2" }} />
      <Skeleton variant="rectangular" width="100%" height="5rem" sx={{ borderRadius: `${radii.md}px` }} />
    </Stack>
  );
}
