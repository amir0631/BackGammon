"use client";

// A compact, diagnostic view of a position for the admin's replay and live watch (§13, §20.3): the
// checker count on each point, the bar, borne off, and pip counts. Players only ever see the 3D board.

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { pipCount, type MatchView, type Position } from "@bg/game-core";
import { Kv, useFmt, useT } from "@/components/common";

function Cell({ point, count }: { point: number; count: number }) {
  const side = count > 0 ? "A" : count < 0 ? "B" : "";
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 0.5,
        textAlign: "center",
        py: 0.5,
        bgcolor: count > 0 ? "primary.main" : count < 0 ? "secondary.main" : "transparent",
        color: count !== 0 ? "primary.contrastText" : "text.secondary",
        minWidth: 0,
      }}
      aria-label={`${point}: ${side} ${Math.abs(count)}`}
    >
      <Typography variant="caption" component="div" sx={{ opacity: 0.8 }}>
        {point}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
        {count === 0 ? "·" : `${side}${Math.abs(count)}`}
      </Typography>
    </Box>
  );
}

export function PositionGrid({ position }: { position: Position }) {
  const t = useT();
  const f = useFmt();
  const top = Array.from({ length: 12 }, (_, i) => 13 + i);
  const bottom = Array.from({ length: 12 }, (_, i) => 12 - i);
  return (
    <Box dir="ltr">
      {[top, bottom].map((row, r) => (
        <Box key={r} sx={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 0.5, mb: 0.5 }}>
          {row.map((p) => (
            <Cell key={p} point={p} count={position.board[p - 1] ?? 0} />
          ))}
        </Box>
      ))}
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", mt: 1 }}>
        <Typography variant="body2">{t("admin.replay.bar", { a: f.n(position.bar[0]), b: f.n(position.bar[1]) })}</Typography>
        <Typography variant="body2">{t("admin.replay.off", { a: f.n(position.off[0]), b: f.n(position.off[1]) })}</Typography>
        <Typography variant="body2">{t("admin.replay.pips", { a: f.n(pipCount(position, 0)), b: f.n(pipCount(position, 1)) })}</Typography>
      </Stack>
    </Box>
  );
}

export function MatchSummaryBox({ view }: { view: MatchView }) {
  const t = useT();
  const f = useFmt();
  const names = view.players.map((p) => p.username || "—");
  return (
    <Box>
      <Kv label={t("admin.replay.players")}>
        <bdi dir="ltr">
          A: @{names[0]} · B: @{names[1]}
        </bdi>
      </Kv>
      <Kv label={t("admin.replay.score")}>
        <bdi dir="ltr">
          {f.n(view.score[0])} – {f.n(view.score[1])}
        </bdi>{" "}
        · {t("admin.replay.game", { n: f.n(view.gameNo) })}
        {view.crawford ? ` · ${t("admin.replay.crawford")}` : ""}
      </Kv>
      <Kv label={t("admin.replay.phase")}>
        {t(`admin.replay.phaseName.${view.phase}`)}
        {view.turn !== null ? ` · ${view.turn === 0 ? "A" : "B"}` : ""}
        {view.dice ? ` · ${view.dice.join("-")}` : ""}
      </Kv>
      <Kv label={t("admin.replay.cube")}>
        {f.n(view.cubeValue)}
        {view.cubeOwner !== null ? ` (${view.cubeOwner === 0 ? "A" : "B"})` : ""}
      </Kv>
    </Box>
  );
}
