import { describe, expect, it } from "vitest";
import type { ServerEnvelope } from "@bg/protocol";
import { historyFromState, historyItem } from "./history";

describe("move history", () => {
  it("rebuilds the current game's turns from a full state", () => {
    const items = historyFromState({
      game_no: 2,
      history: [
        { player: 0, dice: [3, 1], moves: [[8, 5], [6, 5]], cube: null },
        { player: 1, dice: [6, 6], moves: [], cube: null },
        { player: 0, dice: [], moves: [], cube: "offer" },
        { player: 1, dice: [], moves: [], cube: "take" },
        { player: 1, dice: [5, 2], moves: [[13, 8], [13, 11]], cube: null },
      ],
    });
    expect(items).toEqual([
      { kind: "game", gameNo: 2 },
      { kind: "move", player: 0, dice: [3, 1], moves: [[8, 5], [6, 5]], hits: [], auto: null },
      { kind: "pass", player: 1, dice: [6, 6] },
      { kind: "cube", player: 0, action: "offer", value: 2 },
      { kind: "cube", player: 1, action: "take", value: 2 },
      { kind: "move", player: 1, dice: [5, 2], moves: [[13, 8], [13, 11]], hits: [], auto: null },
    ]);
  });

  it("starts with only the game marker when no turn was played", () => {
    expect(historyFromState({ game_no: 1, history: [] })).toEqual([{ kind: "game", gameNo: 1 }]);
  });

  it("adds live events, with the dice of the roll before a move", () => {
    const moved = {
      type: "turn.moved",
      match_id: "m",
      seq: 5,
      payload: { player: 1, moves: [[24, 18]], hits: [true], position: "", auto: "timeout", clock: null },
    } as unknown as ServerEnvelope;
    const before = { dice: [6, 2] } as unknown as Parameters<typeof historyItem>[1];
    expect(historyItem(moved, before)).toEqual({ kind: "move", player: 1, dice: [6, 2], moves: [[24, 18]], hits: [true], auto: "timeout" });
    const tie = { type: "turn.rolled", match_id: "m", seq: 1, payload: { opening: true, dice: [4, 4] } } as unknown as ServerEnvelope;
    expect(historyItem(tie, null)).toBeNull();
  });
});
