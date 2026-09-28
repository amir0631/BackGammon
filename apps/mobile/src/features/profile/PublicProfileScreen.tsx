"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@bg/api-client";
import { layout, radii } from "@bg/design-tokens";
import type { PublicUser } from "@bg/protocol";
import { EditIcon } from "@/components/icons";
import { PublicProfileSkeleton, PublicProfileView } from "@/components/profile/ProfileViews";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { ErrorState } from "@/components/states/ErrorState";
import { errorStatus, toApiError } from "@/lib/apiErrors";
import { useSession } from "@/lib/session";
import { gutterStyles, mqMdUp } from "@/theme/layout";
import { tokensOf } from "@/theme/theme";

// AC-05 Public profile `/profile/[username]` (profile.md §3.5, §4). Case-insensitive URL: the
// canonical casing is displayed and replaces the URL. Shows only what the API returns (username,
// avatar, level, ELO, member since); never a phone, balance, sessions, or account status. Own
// profile adds "This is how other players see you" and Edit profile. Other players get no actions
// in this step (Send coins needs the transfer flow, step 3 screens).

const Card = styled("div")(({ theme }) => {
  const t = tokensOf(theme);
  return {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    marginInline: "auto",
    [mqMdUp]: {
      padding: theme.spacing(4),
      backgroundColor: t.surface,
      border: `1px solid ${t.outlineSubtle}`,
      borderRadius: radii.lg,
    },
  };
});

type State = { kind: "loading" } | { kind: "ok"; user: PublicUser } | { kind: "notFound" } | { kind: "error"; offline: boolean; code?: string };

export function PublicProfileScreen({ username }: { username: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { me } = useSession();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    api.users
      .get(username)
      .then((user) => {
        setState({ kind: "ok", user });
        if (user.username !== username) router.replace(`/profile/${encodeURIComponent(user.username)}`);
      })
      .catch((error) => {
        if (errorStatus(error) === 404) setState({ kind: "notFound" });
        else {
          const e = toApiError(error);
          setState({ kind: "error", offline: e.code === "NETWORK", code: e.code === "NETWORK" ? undefined : e.code });
        }
      });
  }, [username, router]);

  useEffect(load, [load]);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/me"));
  const own = state.kind === "ok" && me?.username?.toLowerCase() === state.user.username.toLowerCase();

  return (
    <SignedInShell
      topBar={{
        // The h1 is the player's name: canonical once loaded, else as requested (loading, not found).
        title: state.kind === "ok" ? state.user.username : username,
        leading: "back",
        onNavigate: back,
      }}
    >
      <Box sx={{ ...gutterStyles, py: 3 }}>
        <Card>
          {state.kind === "loading" && <PublicProfileSkeleton />}
          {state.kind === "notFound" && <ErrorState message={t("publicProfile.notFound")} onBack={back} />}
          {state.kind === "error" && (
            <ErrorState
              kind={state.offline ? "offline" : "error"}
              message={state.offline ? t("net.offline") : t("publicProfile.loadError")}
              code={state.code}
              onRetry={load}
              onBack={back}
            />
          )}
          {state.kind === "ok" && (
            <PublicProfileView
              user={state.user}
              headingComponent="h2"
              note={own ? t("publicProfile.self") : undefined}
              actions={
                own ? (
                  <Button variant="contained" size="large" component={NextLink} href="/me/edit" startIcon={<EditIcon />} fullWidth>
                    {t("profile.hub.editProfile")}
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      </Box>
    </SignedInShell>
  );
}
