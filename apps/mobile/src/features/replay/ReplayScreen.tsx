"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiRequestError } from "@bg/api-client";
import type { MatchSummary, Replay } from "@bg/protocol";
import { LockIcon } from "@/components/icons";
import { SignedInShell } from "@/components/shell/SignedInShell";
import { LoadingState } from "@/components/states/LoadingState";
import { toApiError } from "@/lib/apiErrors";
import { canGoBackInApp } from "@/lib/inAppNav";
import { useRequireUser } from "@/lib/session";
import { supportsWebGL2 } from "@/lib/webgl";
import { gutterStyles } from "@/theme/layout";
// The viewer (3D stage, controls) and the verifier load only when there is something to show:
// RP-03 never downloads them (history-replay.md §3.5).
const ReplayViewer = dynamic(() => import("./ReplayViewer").then((m) => m.ReplayViewer), {
  ssr: false,
  loading: () => <LoadingState variant="cards" rows={2} />,
});
const VerifyDiceSheet = dynamic(() => import("./VerifyDiceSheet").then((m) => m.VerifyDiceSheet), { ssr: false });

// `/replay/[id]` (history-replay.md §3.2): the replay and the summary (for the viewer's side) in
// parallel, then RP-01, or RP-03 in place when there is nothing to show; RP-03 never loads 3D.
// Players only (CLAUDE.md §2 rule 13): the API answers 403 to anyone else, and no screen offers
// sharing, a link, a download, or "request access".

type Unavailable = "private" | "notFound" | "active" | "aborted" | "purged" | "error";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; replay: Replay; summary: MatchSummary | null }
  | { kind: "unavailable"; reason: Unavailable; code?: string; summary: MatchSummary | null };

export function ReplayScreen({ matchId, openVerify }: { matchId: string; openVerify: boolean }) {
  const { me } = useRequireUser();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [webgl, setWebgl] = useState(true);

  const fetchAll = useCallback(() => {
    setLoad({ kind: "loading" });
    void Promise.allSettled([api.matches.replay(matchId), api.matches.get(matchId)]).then(([r, s]) => {
      const summary = s.status === "fulfilled" ? s.value : null;
      if (r.status === "rejected") {
        const e = r.reason;
        const status = e instanceof ApiRequestError ? e.status : 0;
        const code = toApiError(e).code;
        const reason: Unavailable =
          status === 403 ? "private" : status === 404 ? "notFound" : status === 410 || code === "REPLAY_PURGED" ? "purged" : "error";
        setLoad({ kind: "unavailable", reason, code: reason === "error" && code !== "NETWORK" ? code : undefined, summary });
        return;
      }
      const replay = r.value;
      if (replay.status === "active") setLoad({ kind: "unavailable", reason: "active", summary });
      else if (replay.purged_at) setLoad({ kind: "unavailable", reason: "purged", summary });
      else if (replay.status === "aborted" || !replay.events.some((e) => e.type === "turn.rolled"))
        setLoad({ kind: "unavailable", reason: "aborted", summary });
      else setLoad({ kind: "ready", replay, summary });
    });
  }, [matchId]);

  useEffect(() => {
    setWebgl(supportsWebGL2());
    fetchAll();
  }, [fetchAll]);

  if (!me) return null;
  if (load.kind === "loading") {
    return (
      <Frame>
        <LoadingState variant="cards" rows={2} />
      </Frame>
    );
  }
  if (load.kind === "unavailable") return <Unavailable reason={load.reason} code={load.code} matchId={matchId} onRetry={fetchAll} />;
  if (!webgl) return <NoWebGL replay={load.replay} openVerify={openVerify} />;
  const you = load.summary?.you ?? load.replay.you ?? 0;
  return <ReplayViewer replay={load.replay} you={you === 1 ? 1 : 0} openVerify={openVerify} />;
}

function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <SignedInShell
      topBar={{
        title: t("replay.title"),
        leading: "back",
        href: "/me/matches",
        onNavigate: canGoBackInApp() ? () => router.back() : undefined,
      }}
    >
      <Box sx={{ ...gutterStyles, py: 3, maxWidth: 720, width: "100%", mx: "auto" }}>{children}</Box>
    </SignedInShell>
  );
}

/** RP-03 (history-replay.md §3.5): title focused, body, primary, secondary. */
function Unavailable({ reason, code, matchId, onRetry }: { reason: Unavailable; code?: string; matchId: string; onRetry: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), [reason]);
  const back = () => (canGoBackInApp() ? router.back() : router.push("/me/matches"));

  const copy: Record<Unavailable, { title: string; body: string }> = {
    private: { title: t("replay.private.title"), body: t("replay.private.body") },
    notFound: { title: t("replay.notFound.title"), body: t("replay.notFound.body") },
    active: { title: t("replay.active.title"), body: t("replay.active.body") },
    aborted: { title: t("replay.aborted.title"), body: t("replay.aborted.body") },
    purged: { title: t("replay.purged.title"), body: t("replay.purged.body") },
    error: { title: t("replay.loadError.title"), body: t("errors.network") },
  };
  const primary =
    reason === "active" ? (
      <Button variant="contained" component={NextLink} href={`/match/${matchId}`}>
        {t("history.row.returnToMatch")}
      </Button>
    ) : reason === "aborted" || reason === "purged" ? (
      <Button variant="contained" component={NextLink} href={`/match/${matchId}`}>
        {t("replay.matchSummary")}
      </Button>
    ) : reason === "notFound" ? (
      <Button variant="contained" component={NextLink} href="/me/matches">
        {t("match.notFound.history")}
      </Button>
    ) : reason === "error" ? (
      <Button variant="contained" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    ) : null;

  return (
    <Frame>
      <Stack spacing={2} sx={{ alignItems: "flex-start" }} role={reason === "error" ? "alert" : undefined}>
        <Typography
          ref={titleRef}
          tabIndex={-1}
          variant="h3"
          component="h1"
          sx={{ display: "flex", gap: 1, alignItems: "center", "&:focus": { outline: "none" } }}
        >
          {reason === "private" && <LockIcon />}
          {copy[reason].title}
        </Typography>
        <Typography>{copy[reason].body}</Typography>
        {code && (
          <Typography variant="caption" color="text.secondary">
            <bdi>{t("common.errorCode", { code })}</bdi>
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {primary}
          <Button variant={primary ? "text" : "contained"} onClick={back}>
            {t("common.back")}
          </Button>
        </Stack>
      </Stack>
    </Frame>
  );
}

/** WebGL2 missing: MA-17 content without the in-match text; verifying the dice needs no 3D. */
function NoWebGL({ replay, openVerify }: { replay: Replay; openVerify: boolean }) {
  const t = useTranslations();
  const [verify, setVerify] = useState(openVerify);
  return (
    <Frame>
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h1">
          {t("match.unsupported.title")}
        </Typography>
        <Typography>{t("match.unsupported.body")}</Typography>
        <Button variant="contained" onClick={() => setVerify(true)}>
          {t("replay.verify.title")}
        </Button>
      </Stack>
      <VerifyDiceSheet open={verify} onClose={() => setVerify(false)} replay={replay} />
    </Frame>
  );
}
