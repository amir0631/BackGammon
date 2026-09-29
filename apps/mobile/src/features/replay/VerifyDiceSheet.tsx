"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { iconSize } from "@bg/design-tokens";
import { verifyDice, type DiceVerification } from "@bg/game-core/src/replay";
import type { Replay } from "@bg/protocol";
import { ErrorIcon, SuccessIcon, WarningIcon } from "@/components/icons";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { CopyButton } from "@/components/wallet/CopyButton";
import { useFormat } from "@/lib/useFormat";
import { useReducedMotion } from "@/theme/motion";

// RP-02 Verify dice (history-replay.md §3.4): the commitment and the published seed, then the check
// on this device only (WebCrypto SHA-256 and HMAC-SHA-256, no network): sha256(seed) must equal the
// commitment, and every `turn.rolled` must equal the dice derived for its roll number (opening
// rolls and ties included). Outcomes use an icon and text, never color alone. The result is kept
// while the replay stays open ("Verify again").

type Outcome = { kind: "done"; result: DiceVerification } | { kind: "unsupported" };

/** Hex in groups of 8, so a long value wraps by groups at any text size. */
function Hex({ value }: { value: string }) {
  const groups = value.match(/.{1,8}/g) ?? [value];
  return (
    <Typography
      component="p"
      variant="body2"
      dir="ltr"
      sx={{ fontFamily: "ui-monospace, monospace", m: 0, display: "flex", flexWrap: "wrap", columnGap: 1, rowGap: 0.25, minWidth: 0 }}
    >
      {groups.map((g, i) => (
        <span key={i}>{g}</span>
      ))}
    </Typography>
  );
}

export function VerifyDiceSheet({ open, onClose, replay }: { open: boolean; onClose: () => void; replay: Replay }) {
  const t = useTranslations("replay.verify");
  const tCommon = useTranslations("common");
  const f = useFormat();
  const reduced = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const run = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const rolls = useMemo(() => replay.events.filter((e) => e.type === "turn.rolled").sort((a, b) => a.seq - b.seq), [replay]);
  // The game each roll belongs to, for the mismatch rows.
  const gameOfRoll = useMemo(() => {
    const out: number[] = [];
    let game = 1;
    for (const e of [...replay.events].sort((a, b) => a.seq - b.seq)) {
      if (e.type === "game.started") game = Number((e.payload as { game_no?: number }).game_no ?? game);
      if (e.type === "turn.rolled") out.push(game);
    }
    return out;
  }, [replay]);

  const verify = async () => {
    const id = ++run.current;
    if (!globalThis.crypto?.subtle || !replay.seed) {
      setOutcome({ kind: "unsupported" });
      return;
    }
    setRunning(true);
    setOutcome(null);
    try {
      const result = await verifyDice(replay.seed, replay.seed_commit, replay.id, replay.events);
      if (id !== run.current) return;
      setOutcome({ kind: "done", result });
      window.setTimeout(() => resultRef.current?.focus(), 0);
    } catch {
      if (id === run.current) setOutcome({ kind: "unsupported" });
    } finally {
      if (id === run.current) setRunning(false);
    }
  };
  const stop = () => {
    run.current += 1;
    setRunning(false);
  };

  const done = outcome?.kind === "done" ? outcome.result : null;
  const bad = done ? done.rolls.filter((r) => !r.ok) : [];

  return (
    <BottomSheet open={open} onClose={onClose} title={t("title")}>
      <Stack spacing={2}>
        <Typography variant="body2">{t("explain")}</Typography>
        <Stack spacing={0.5}>
          <Typography variant="labelSmall" component="h3" color="text.secondary">
            {t("commit")}
          </Typography>
          <Stack direction="row" sx={{ alignItems: "flex-start", gap: 0.5 }}>
            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
              <Hex value={replay.seed_commit} />
            </Box>
            <CopyButton value={replay.seed_commit} label={`${tCommon("copy")}: ${t("commit")}`} />
          </Stack>
        </Stack>
        {replay.seed && (
          <Stack spacing={0.5}>
            <Typography variant="labelSmall" component="h3" color="text.secondary">
              {t("seed")}
            </Typography>
            <Stack direction="row" sx={{ alignItems: "flex-start", gap: 0.5 }}>
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <Hex value={replay.seed} />
              </Box>
              <CopyButton value={replay.seed} label={`${tCommon("copy")}: ${t("seed")}`} />
            </Stack>
          </Stack>
        )}
        <Typography variant="body1">{t("count", { n: rolls.length })}</Typography>

        {running ? (
          <Stack spacing={1} role="status">
            <Typography variant="body2">{t("progress", { i: f.number(rolls.length), n: f.number(rolls.length) })}</Typography>
            {!reduced && <LinearProgress aria-hidden />}
            <Button variant="text" onClick={stop} sx={{ alignSelf: "flex-start" }}>
              {t("stop")}
            </Button>
          </Stack>
        ) : (
          <Button variant="contained" size="large" onClick={() => void verify()}>
            {outcome ? t("again") : t("run")}
          </Button>
        )}

        {outcome && (
          <Stack spacing={1} ref={resultRef} tabIndex={-1} role="status" sx={{ "&:focus": { outline: "none" } }}>
            {outcome.kind === "unsupported" ? (
              <Typography sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <WarningIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.warning" }} />
                {t("unsupported")}
              </Typography>
            ) : (
              <>
                <Typography sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  {done!.commitOk ? (
                    <SuccessIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.success" }} />
                  ) : (
                    <ErrorIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.error" }} />
                  )}
                  {done!.commitOk ? t("commitOk") : t("commitBad")}
                </Typography>
                <Typography sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  {bad.length === 0 ? (
                    <SuccessIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.success" }} />
                  ) : (
                    <ErrorIcon sx={{ fontSize: iconSize.md, flex: "none", color: "tokens.error" }} />
                  )}
                  {bad.length === 0
                    ? t("allOk", { n: done!.rolls.length })
                    : t("someBad", { k: f.number(bad.length), n: f.number(done!.rolls.length) })}
                </Typography>
                {bad.length > 0 && (
                  <Box component="ul" sx={{ m: 0, paddingInlineStart: 3 }}>
                    {bad.map((r) => (
                      <Typography component="li" variant="body2" key={r.n}>
                        {t("mismatchRow", {
                          i: f.number(r.n + 1),
                          g: f.number(gameOfRoll[r.n] ?? 1),
                          a: f.number(r.recorded[0] ?? 0),
                          b: f.number(r.recorded[1] ?? 0),
                          c: f.number(r.expected[0] ?? 0),
                          d: f.number(r.expected[1] ?? 0),
                        })}
                      </Typography>
                    ))}
                  </Box>
                )}
                {(!done!.commitOk || bad.length > 0) && (
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                    <Typography variant="body2" sx={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                      {t("support", { id: replay.id })}
                    </Typography>
                    <CopyButton value={replay.id} label={`${tCommon("copy")}: ${t("matchId")}`} />
                  </Stack>
                )}
              </>
            )}
          </Stack>
        )}

        <Box component="details" sx={{ "& summary": { cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" } }}>
          <Typography component="summary" variant="label">
            {t("howTitle")}
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2">{t("howSteps")}</Typography>
            <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {t("matchId")}
              </Typography>
              <Typography variant="body2" dir="ltr" sx={{ fontFamily: "ui-monospace, monospace", overflowWrap: "anywhere", minWidth: 0 }}>
                {replay.id}
              </Typography>
              <CopyButton value={replay.id} label={`${tCommon("copy")}: ${t("matchId")}`} />
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </BottomSheet>
  );
}
