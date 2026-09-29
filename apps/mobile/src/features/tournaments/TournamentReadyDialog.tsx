"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { avatarSize, iconSize, layout } from "@bg/design-tokens";
import { isolate } from "@bg/i18n";
import type { MatchFoundOut } from "@bg/protocol";
import { CountdownText } from "@/components/feedback/CountdownText";
import { TournamentsIcon, WarningIcon } from "@/components/icons";
import { Avatar } from "@/components/profile/Avatar";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { useGameSocket } from "@/lib/socket";
import { useCountdown } from "@/lib/useCountdown";
import { useFormat } from "@/lib/useFormat";
import { visuallyHidden } from "@/theme/layout";
import { clearTournamentFound, useTournamentReady } from "./readyStore";

// TO-08 "Your tournament match is ready" (tournaments.md §3.6 steps 1–2, UX review TO-01).
// - `TournamentReadyDialog`: the blocking dialog, shown by the app-level host on every screen
//   except a running player match, including the spectator view.
// - `TournamentReadyNotice`: the non-blocking line inside a running player match, with "Details"
//   opening the same content in a sheet. Both matches' clocks keep running (§10 Q9).
// Loaded on demand, so routes carry none of this until a bracket match is found.

/** The 30 s and 10 s warning, announced once each (§3.6 step 1, §7). */
function useWarningAnnouncement(left: number, text: (time: string) => string): string {
  const f = useFormat();
  const said = useRef<30 | 10 | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const bucket = left > 0 && left <= 10 ? 10 : left > 0 && left <= 30 ? 30 : null;
    if (bucket !== null && said.current !== bucket) {
      said.current = bucket;
      setMessage(text(`⁦${f.clock(left)}⁩`));
    }
  }, [left, text, f]);
  return message;
}

function ReadyBody({ found, left, bodyId }: { found: MatchFoundOut; left: number; bodyId?: string }) {
  const t = useTranslations("tournaments");
  const f = useFormat();
  const tour = found.tournament;
  const name = tour ? tour.name[f.locale] || tour.name.fa || tour.name.en || "" : "";
  const opp = found.opponent;
  const warn = left > 0 && left <= 30;
  return (
    <div id={bodyId}>
      {tour && (
        <Typography variant="body2" color="text.secondary">
          {t("ready.round", { name, round: f.number(tour.round), rounds: f.number(tour.rounds) })}
        </Typography>
      )}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", my: 1.5 }}>
        <Avatar avatarKey={opp.avatar} size={avatarSize.sm} />
        <Typography variant="body1">{t("ready.opponent", { username: isolate(opp.username), level: f.number(opp.level), elo: f.number(opp.elo) })}</Typography>
      </Stack>
      <Typography
        variant="body1"
        component="p"
        sx={{ display: "flex", alignItems: "center", gap: 0.5, color: warn ? "tokens.warning" : undefined, fontWeight: warn ? 600 : undefined }}
      >
        {/* Warning style is icon plus text, never color alone (review TO-04). */}
        {warn && <WarningIcon sx={{ fontSize: iconSize.sm, flex: "none" }} />}
        <span>{left > 0 ? <CountdownText seconds={left} clock={f.clock} render={(time) => t("ready.countdown", { time })} /> : t("ready.noCountdown")}</span>
      </Typography>
    </div>
  );
}

function useGoToMatch(found: MatchFoundOut) {
  const router = useRouter();
  const socket = useGameSocket();
  return () => {
    // From the spectator view: stop watching first (`spectate.leave`), then join as a player.
    if (socket.spectating) socket.detach();
    clearTournamentFound();
    router.push(`/match/${found.match_id}`);
  };
}

/** TO-08: a blocking dialog when a bracket match is created for this player. */
export default function TournamentReadyDialog({ found }: { found: MatchFoundOut }) {
  const t = useTranslations("tournaments");
  const goRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const left = useCountdown(found.join_deadline || null);
  const go = useGoToMatch(found);
  const announce = useWarningAnnouncement(left, (time) => t("ready.countdown", { time }));

  return (
    <Dialog
      open
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      disableEscapeKeyDown
      onClose={() => undefined}
      slotProps={{ paper: { sx: { maxWidth: layout.dialogMaxWidth, width: "100%", m: 2 } }, transition: { onEntered: () => goRef.current?.focus() } }}
    >
      <Stack spacing={2} sx={{ p: 3 }}>
        <Typography id={titleId} variant="h4" component="h2">
          {t("ready.title")}
        </Typography>
        <ReadyBody found={found} left={left} bodyId={bodyId} />
        <Button ref={goRef} variant="contained" size="large" onClick={go}>
          {t("ready.go")}
        </Button>
        <Button variant="text" onClick={clearTournamentFound}>
          {t("ready.notNow")}
        </Button>
      </Stack>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>
    </Dialog>
  );
}

/**
 * §3.6 step 2: inside a running player match, a non-blocking line with the countdown and
 * "Details" (TO-08 content in a sheet). Nothing for the match on screen itself.
 */
export function TournamentReadyNotice({ matchId }: { matchId: string }) {
  const { found } = useTournamentReady();
  if (!found || found.match_id === matchId) return null;
  return <Notice key={found.match_id} found={found} />;
}

function Notice({ found }: { found: MatchFoundOut }) {
  const t = useTranslations("tournaments");
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const left = useCountdown(found.join_deadline || null);
  const go = useGoToMatch(found);
  const announce = useWarningAnnouncement(left, (time) => t("ready.inMatch", { time }));
  const expired = found.join_deadline > 0 && left === 0;
  if (expired) return null;
  const warn = left > 0 && left <= 30;
  const Icon = warn ? WarningIcon : TournamentsIcon;
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          columnGap: 1,
          px: 1.5,
          py: 0.5,
          bgcolor: "tokens.infoContainer",
          color: "tokens.onInfoContainer",
        }}
      >
        <Typography variant="body2" component="p" sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: "1 1 12rem", minWidth: 0, m: 0, color: "inherit", fontWeight: warn ? 600 : undefined }}>
          <Icon sx={{ fontSize: iconSize.sm, flex: "none" }} />
          <span>{left > 0 ? <CountdownText seconds={left} clock={f.clock} render={(time) => t("ready.inMatch", { time })} /> : t("ready.title")}</span>
        </Typography>
        <Button size="small" color="inherit" variant="outlined" onClick={() => setOpen(true)} sx={{ minHeight: 44 }}>
          {t("ready.details")}
        </Button>
      </Box>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {announce}
      </span>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("ready.title")}
        footer={
          <Stack spacing={1}>
            <Button variant="contained" size="large" onClick={go}>
              {t("ready.go")}
            </Button>
            <Button variant="text" onClick={() => setOpen(false)}>
              {t("ready.notNow")}
            </Button>
          </Stack>
        }
      >
        <ReadyBody found={found} left={left} />
      </BottomSheet>
    </>
  );
}
