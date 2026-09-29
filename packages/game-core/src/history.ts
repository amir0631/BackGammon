// Move history of the match screen (match.md MA-04). Built from the current game's turns in a full
// `match.state` (`history`, so a reconnect or reload keeps the list whole) and extended with each
// event applied after it. Display data only; the server decides every move (CLAUDE.md §2 rule 1).
import type { CubeUpdateOut, GameEndedOut, HistoryEntryOut, MatchStateOut, ServerEnvelope, TurnMovedOut } from "@bg/protocol";
import type { MatchView } from "./store";

export type HistoryItem =
  | { kind: "game"; gameNo: number }
  | { kind: "opening"; dice: [number, number] }
  /** `hits` and `auto` are only known for moves seen live (a full state carries neither). */
  | { kind: "move"; player: number; dice: [number, number] | null; moves: number[][]; hits: boolean[]; auto: TurnMovedOut["auto"] }
  | { kind: "pass"; player: number; dice: [number, number] | null }
  | { kind: "cube"; player: number; action: CubeUpdateOut["action"]; value: number }
  | { kind: "result"; result: GameEndedOut };

function pair(dice: readonly number[] | null | undefined): [number, number] | null {
  return dice && dice.length === 2 ? [dice[0]!, dice[1]!] : null;
}

/**
 * The current game's turns from a full state, oldest first: a "game" marker, then each move, pass,
 * or cube action. Cube values follow the doubling from 1 (every game starts with the cube at 1).
 */
export function historyFromState(state: Pick<MatchStateOut, "game_no" | "history">): HistoryItem[] {
  const out: HistoryItem[] = [{ kind: "game", gameNo: state.game_no }];
  let cube = 1;
  for (const entry of state.history as HistoryEntryOut[]) {
    if (entry.cube) {
      if (entry.cube === "offer") cube *= 2;
      out.push({ kind: "cube", player: entry.player, action: entry.cube, value: cube });
    } else if (entry.moves.length > 0) {
      out.push({ kind: "move", player: entry.player, dice: pair(entry.dice), moves: entry.moves, hits: [], auto: null });
    } else {
      out.push({ kind: "pass", player: entry.player, dice: pair(entry.dice) });
    }
  }
  return out;
}

/** The history line for one live event, given the view before it (for the dice of a move). */
export function historyItem(env: ServerEnvelope, before: MatchView | null): HistoryItem | null {
  switch (env.type) {
    case "game.started":
      return { kind: "game", gameNo: env.payload.game_no };
    case "turn.rolled":
      return env.payload.opening && env.payload.dice[0] !== env.payload.dice[1]
        ? { kind: "opening", dice: [env.payload.dice[0]!, env.payload.dice[1]!] }
        : null;
    case "turn.moved":
      return {
        kind: "move",
        player: env.payload.player,
        dice: before?.dice ?? null,
        moves: env.payload.moves,
        hits: env.payload.hits,
        auto: env.payload.auto,
      };
    case "turn.passed":
      return { kind: "pass", player: env.payload.player, dice: before?.dice ?? null };
    case "cube.update":
      return { kind: "cube", player: env.payload.player, action: env.payload.action, value: env.payload.value };
    case "game.ended":
      return { kind: "result", result: env.payload };
    default:
      return null;
  }
}
