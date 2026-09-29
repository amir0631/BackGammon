"use client";

// A match for the admin (§13 Live and replays, §20.3). `?live=1` watches it now over a hidden admin
// socket (not counted, never visible to players); otherwise the recorded replay, with exact
// timestamps, think time per move, disconnect markers, dice verification, and the per-move bot
// comparison. Every replay open is logged by the server (replay_view).

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { GameSocket, api, type SocketStatus } from "@bg/api-client";
import { apply, buildReplay, step, verifyDice, type DiceVerification, type MatchView } from "@bg/game-core";
import type { ReplayEvent, ServerEnvelope } from "@bg/protocol";
import { DataTable, LoadError, Loading, Ltr, PageHeader, Screen, Section, useApi, useFmt, useT } from "@/components/common";
import { EyeIcon, WarningIcon } from "@/components/icons";
import { MatchSummaryBox, PositionGrid } from "@/components/match-view";

function describe(e: { type: string; payload: Record<string, unknown> }): string {
  const p = e.payload;
  switch (e.type) {
    case "turn.rolled":
      return `${p.opening ? "opening " : ""}${(p.dice as number[]).join("-")}`;
    case "turn.moved":
      return `${(p.moves as number[][]).map((m) => `${m[0]}/${m[1]}`).join(" ")}${p.auto ? ` (${p.auto as string})` : ""}`;
    case "cube.update":
      return `${p.action as string} ×${p.value as number}`;
    case "react.recv":
      return `${p.kind as string}: ${p.key as string}`;
    case "game.ended":
      return `${p.kind as string} ${p.points as number} (${p.reason as string})`;
    case "match.ended":
      return `${p.reason as string}`;
    default:
      return "";
  }
}

function LiveWatch({ id }: { id: string }) {
  const t = useT();
  const [view, setView] = useState<MatchView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [feed, setFeed] = useState<ServerEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<MatchView | null>(null);

  useEffect(() => {
    const socket = new GameSocket({
      getToken: async () => (await api.admin.wsToken()).token,
      onStatus: setStatus,
      onMessage: (env) => {
        if (env.type === "error") {
          setError(String((env.payload as { code?: string }).code ?? ""));
          return;
        }
        const res = apply(viewRef.current, env);
        if (res.needsSync) {
          socket.spectate(id); // a gap: ask for a full state again
          return;
        }
        if (!res.ignored) {
          viewRef.current = res.view;
          setView(res.view);
          setFeed((f) => [env, ...f].slice(0, 200));
        }
      },
    });
    socket.connect();
    socket.spectate(id);
    return () => {
      socket.leave();
      socket.close();
    };
  }, [id]);

  return (
    <>
      <Alert severity="info" icon={<EyeIcon />} sx={{ mb: 2 }}>
        {t("admin.replay.hidden")} · {t(`admin.replay.socket.${status}`)}
      </Alert>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{t("admin.replay.watchError", { code: error })}</Alert>}
      {!view ? (
        <Loading />
      ) : (
        <>
          <Section title={t("admin.replay.now")}>
            <MatchSummaryBox view={view} />
            <Box sx={{ mt: 2 }}>
              <PositionGrid position={view.position} />
            </Box>
          </Section>
          <Section title={t("admin.replay.feed")}>
            <Stack spacing={0.5}>
              {feed.map((e, i) => (
                <Typography key={`${e.seq}-${i}`} variant="body2" dir="ltr" sx={{ fontFamily: "monospace" }}>
                  #{e.seq} {e.type} {describe(e as unknown as { type: string; payload: Record<string, unknown> })}
                </Typography>
              ))}
            </Stack>
          </Section>
        </>
      )}
    </>
  );
}

function Replay({ id }: { id: string }) {
  const t = useT();
  const f = useFmt();
  const replay = useApi((signal) => api.admin.replay(id, { signal }), [id]);
  const analysis = useApi((signal) => api.admin.matchAnalysis(id, { signal }), [id]);
  const timeline = useMemo(() => (replay.data ? buildReplay(replay.data) : null), [replay.data]);
  const [frame, setFrame] = useState(0);
  const [verified, setVerified] = useState<DiceVerification | null>(null);

  if (replay.error) return <LoadError error={replay.error} onRetry={replay.reload} />;
  if (!replay.data || !timeline) return <Loading />;
  const r = replay.data;
  const current = timeline.frames[frame];

  // Think time: from the dice (or the previous event) to the move.
  const thinks = new Map<number, number>();
  let rolledAt = 0;
  for (const e of r.events) {
    const at = Date.parse(e.server_ts);
    if (e.type === "turn.rolled") rolledAt = at;
    if (e.type === "turn.moved" && rolledAt) thinks.set(e.seq, (at - rolledAt) / 1000);
  }
  const marked = new Set(["opponent.disconnected", "opponent.back", "turn.timeout"]);

  return (
    <>
      {r.purged_at && <Alert severity="warning" sx={{ mb: 2 }}>{t("admin.replay.purged", { date: f.date(r.purged_at) })}</Alert>}
      <Section
        title={t("admin.replay.player")}
        action={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button onClick={() => setFrame((n) => step(timeline, n, -1))} disabled={frame === 0}>
              {t("admin.replay.prev")}
            </Button>
            <Button onClick={() => setFrame((n) => step(timeline, n, 1))} disabled={frame >= timeline.frames.length - 1}>
              {t("admin.replay.next")}
            </Button>
            <TextField
              select
              size="small"
              label={t("admin.replay.jump")}
              value=""
              onChange={(e) => setFrame(Number(e.target.value))}
              sx={{ minWidth: 140 }}
            >
              {timeline.games.map((g) => (
                <MenuItem key={g.frame} value={g.frame}>
                  {t("admin.replay.game", { n: f.n(g.gameNo) })}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        }
      >
        {current ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} dir="ltr">
              #{current.event.seq} · {current.event.type} · {describe(current.event)} · {f.dateTime(current.event.server_ts)}
            </Typography>
            <MatchSummaryBox view={current.view} />
            <Box sx={{ mt: 2 }}>
              <PositionGrid position={current.view.position} />
            </Box>
          </>
        ) : (
          <Typography variant="body2">{t("admin.replay.empty")}</Typography>
        )}
      </Section>

      <Section
        title={t("admin.replay.dice")}
        action={
          r.seed ? (
            <Button variant="outlined" onClick={() => void verifyDice(r.seed ?? "", r.seed_commit, r.id, r.events).then(setVerified)}>
              {t("admin.replay.verify")}
            </Button>
          ) : null
        }
      >
        <Typography variant="body2" dir="ltr" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
          commit: {r.seed_commit}
          <br />
          seed: {r.seed ?? "—"}
        </Typography>
        {verified && (
          <Alert severity={verified.ok ? "success" : "error"} sx={{ mt: 1 }}>
            {verified.ok
              ? t("admin.replay.verifyOk", { n: f.n(verified.rolls.length) })
              : t("admin.replay.verifyBad", { bad: f.n(verified.rolls.filter((x) => !x.ok).length), commit: String(verified.commitOk) })}
          </Alert>
        )}
      </Section>

      {analysis.data && (
        <Section title={t("admin.replay.analysis")}>
          <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: "wrap" }}>
            {(["0", "1"] as const).map((side) => {
              const s = analysis.data!.summary[side];
              return (
                <Chip
                  key={side}
                  label={t("admin.replay.agreement", {
                    side: side === "0" ? "A" : "B",
                    agree: f.n(s.agree),
                    moves: f.n(s.moves),
                    pct: s.moves ? f.n(Math.round((100 * s.agree) / s.moves)) : "—",
                  })}
                />
              );
            })}
          </Stack>
          <DataTable
            rows={analysis.data.moves.filter((m) => m.agrees !== null)}
            rowKey={(m) => `${m.game}-${m.seq}`}
            empty={t("admin.replay.noAnalysis")}
            columns={[
              { key: "g", label: t("admin.replay.col.game"), render: (m) => f.n(m.game) },
              { key: "p", label: t("admin.replay.col.side"), render: (m) => (m.player === 0 ? "A" : "B") },
              { key: "d", label: t("admin.replay.col.dice"), render: (m) => <Ltr>{m.dice.join("-")}</Ltr> },
              { key: "played", label: t("admin.replay.col.played"), render: (m) => <Ltr>{m.played.map((x) => `${x[0]}/${x[1]}`).join(" ")}</Ltr> },
              { key: "best", label: t("admin.replay.col.best"), render: (m) => <Ltr>{m.best?.map((x) => `${x[0]}/${x[1]}`).join(" ") ?? "—"}</Ltr> },
              { key: "a", label: t("admin.replay.col.agrees"), render: (m) => t(m.agrees ? "admin.common.yes" : "admin.common.no") },
            ]}
          />
        </Section>
      )}

      <Section title={t("admin.replay.timeline")}>
        <DataTable<ReplayEvent>
          rows={r.events}
          rowKey={(e) => e.seq}
          empty={t("admin.replay.empty")}
          onRowClick={(e) => setFrame(timeline.frames.findIndex((fr) => fr.event.seq === e.seq))}
          columns={[
            { key: "seq", label: "#", render: (e) => <Ltr>{e.seq}</Ltr> },
            { key: "ts", label: t("admin.replay.col.time"), render: (e) => f.dateTime(e.server_ts) },
            {
              key: "type",
              label: t("admin.replay.col.event"),
              render: (e) => (
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  {marked.has(e.type) && <WarningIcon fontSize="small" color="warning" />}
                  <Ltr>{e.type}</Ltr>
                </Stack>
              ),
            },
            { key: "actor", label: t("admin.replay.col.actor"), render: (e) => <Ltr>{e.actor}</Ltr> },
            { key: "what", label: t("admin.replay.col.detail"), render: (e) => <Ltr>{describe(e)}</Ltr> },
            { key: "think", label: t("admin.replay.col.think"), align: "right", render: (e) => (thinks.has(e.seq) ? `${f.n(Math.round(thinks.get(e.seq)! * 10) / 10)}s` : "") },
          ]}
        />
      </Section>
    </>
  );
}

function MatchPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const live = search.get("live") === "1";
  return (
    <>
      <PageHeader title={t(live ? "admin.replay.liveTitle" : "admin.replay.title")} subtitle={<Ltr>{params.id}</Ltr>} />
      {live ? <LiveWatch id={params.id} /> : <Replay id={params.id} />}
    </>
  );
}

export default function Page() {
  return (
    <Screen>
      <Suspense>
        <MatchPage />
      </Suspense>
    </Screen>
  );
}
