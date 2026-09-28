// Board position and the mover's view of it, mirroring backend/game/engine/board.py.
// board[i]: checkers on absolute point i+1 (A's numbering), + for A (player 0), - for B (player 1).
// Moves use the mover's own numbering: 1-24, 25 = bar, 0 = off.

export const A = 0;
export const B = 1;
export const BAR = 25;
export const OFF = 0;
export const CHECKERS = 15;

export type Player = 0 | 1;

export interface Position {
  board: number[];
  bar: [number, number];
  off: [number, number];
}

export function decode(text: string): Position {
  const v = text.split(",").map(Number);
  if (v.length !== 28 || v.some((n) => !Number.isInteger(n))) throw new Error("bad position");
  return { board: v.slice(0, 24), bar: [v[24]!, v[25]!], off: [v[26]!, v[27]!] };
}

export function encode(p: Position): string {
  return [...p.board, ...p.bar, ...p.off].join(",");
}

export function initialPosition(): Position {
  const board = new Array<number>(24).fill(0);
  for (const [point, count] of [[24, 2], [13, 5], [8, 3], [6, 5]] as const) {
    board[point - 1] = count;
    board[24 - point] = -count;
  }
  return { board, bar: [0, 0], off: [0, 0] };
}

/** The mover's point (1-24) as an absolute point in A's numbering. */
export function absolutePoint(player: Player, point: number): number {
  return player === A ? point : 25 - point;
}

export interface View {
  /** mine[0] = off, mine[1..24] = my points, mine[25] = my bar. */
  mine: number[];
  /** Opponent checkers on my numbering of the points; theirs[25] = their bar, theirs[0] = their off. */
  theirs: number[];
}

export function view(p: Position, player: Player): View {
  const mine = new Array<number>(26).fill(0);
  const theirs = new Array<number>(26).fill(0);
  for (let point = 1; point <= 24; point++) {
    let count = p.board[absolutePoint(player, point) - 1]!;
    if (player === B) count = -count;
    if (count > 0) mine[point] = count;
    else if (count < 0) theirs[point] = -count;
  }
  const other = (1 - player) as Player;
  mine[OFF] = p.off[player];
  mine[BAR] = p.bar[player];
  theirs[OFF] = p.off[other];
  theirs[BAR] = p.bar[other];
  return { mine, theirs };
}

export function fromView(player: Player, { mine, theirs }: View): Position {
  const board = new Array<number>(24).fill(0);
  const sign = player === A ? 1 : -1;
  for (let point = 1; point <= 24; point++) {
    const idx = absolutePoint(player, point) - 1;
    if (mine[point]) board[idx] = sign * mine[point]!;
    else if (theirs[point]) board[idx] = -sign * theirs[point]!;
  }
  const bar: [number, number] = [0, 0];
  const off: [number, number] = [0, 0];
  const other = (1 - player) as Player;
  bar[player] = mine[BAR]!;
  bar[other] = theirs[BAR]!;
  off[player] = mine[OFF]!;
  off[other] = theirs[OFF]!;
  return { board, bar, off };
}

export function pipCount(p: Position, player: Player): number {
  const { mine } = view(p, player);
  let pips = 0;
  for (let point = 1; point <= 25; point++) pips += point * mine[point]!;
  return pips;
}
