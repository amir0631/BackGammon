"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { decode, initialPosition, TurnBuilder, type Player } from "@bg/game-core";
import { BoardStage } from "@/features/match/BoardStage";
import { useSceneLabels } from "@/features/match/useSceneLabels";

// Query: lite=1, reduced=1, side=1 (view as player B), moves=1 (a turn with highlights),
// dice=a,b (show a throw), mid=1 (a mid-game position with bar and borne-off checkers).
const MID = "0,-2,0,0,0,4,2,3,0,0,0,-4,3,0,0,0,-2,0,-4,-2,0,0,0,0,1,1,1,0";
const LEGAL_31 = [[[8, 5], [6, 5]], [[24, 21], [24, 23]], [[13, 10], [10, 9]], [[8, 5], [8, 7]]];

export function DevBoard() {
  const q = useSearchParams();
  const labels = useSceneLabels();
  const side = (q.get("side") === "1" ? 1 : 0) as Player;
  const position = useMemo(() => (q.get("mid") ? decode(MID) : initialPosition()), [q]);
  const [builder] = useState(() => (q.get("moves") ? new TurnBuilder(initialPosition(), side, [3, 1], LEGAL_31) : null));
  const [selected, setSelected] = useState<number | null>(q.get("select") ? Number(q.get("select")) : null);
  const [, setTick] = useState(0);
  const dice = q.get("dice")?.split(",").map(Number);

  return (
    <div style={{ height: "100dvh", width: "100%" }}>
      <BoardStage
        label="board"
        position={builder ? builder.position : position}
        perspective={side}
        lite={q.get("lite") === "1"}
        reducedMotion={q.get("reduced") === "1"}
        dice={dice && dice.length === 2 ? { key: "d", values: [dice[0]!, dice[1]!], throwSeed: 12345, thrower: "self", animate: true } : null}
        input={
          builder
            ? {
                sources: builder.sources(),
                targets: (from) => builder.targets(from),
                selected,
                onSelect: setSelected,
                onMove: (from, to) => {
                  builder.move(from, to);
                  setSelected(null);
                  setTick((n) => n + 1);
                },
                onInvalid: () => undefined,
              }
            : null
        }
        lastMove={q.get("mid") ? [{ from: 13, to: 7 }] : null}
        moveHint={null}
        snapKey={0}
        labels={labels}
        themes={{ board: "default", checkers: ["default", "default"] }}
      />
    </div>
  );
}
