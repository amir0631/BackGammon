// Single checker steps and the turn builder that drives legal-move highlighting and undo
// (CLAUDE.md §4 game-core, §11.1 Input). The server stays authoritative: the legal plays it sends
// define which final positions are allowed; this only finds the steps that lead to one of them.
import { BAR, CHECKERS, OFF, type Player, type Position, type View, encode, fromView, view } from "./position";

export interface Step {
  from: number;
  to: number;
  die: number;
  hit: boolean;
}

/** The step moving a checker from `from` with `die`, or null (same rules as the backend engine). */
export function singleStep(v: View, from: number, die: number): Step | null {
  const { mine, theirs } = v;
  if (!mine[from]) return null;
  if (mine[BAR] && from !== BAR) return null;
  const to = from - die;
  if (to >= 1) {
    if (theirs[to]! >= 2) return null;
    return { from, to, die, hit: theirs[to] === 1 };
  }
  for (let p = 7; p <= 25; p++) if (mine[p]) return null; // all home before bearing off
  if (to === 0) return { from, to: OFF, die, hit: false };
  for (let p = from + 1; p <= 6; p++) if (mine[p]) return null; // higher die: highest point only
  return { from, to: OFF, die, hit: false };
}

export function applyStep(v: View, step: Step): View {
  const mine = [...v.mine];
  const theirs = [...v.theirs];
  mine[step.from]!--;
  mine[step.to]!++;
  if (step.hit) {
    theirs[step.to]!--;
    theirs[BAR]!++;
  }
  return { mine, theirs };
}

function key(v: View): string {
  return `${v.mine.join(",")}|${v.theirs.join(",")}`;
}

function removeOne(dice: number[], die: number): number[] {
  const i = dice.indexOf(die);
  return i < 0 ? dice : [...dice.slice(0, i), ...dice.slice(i + 1)];
}

/** Dice that could make a [from, to] step: the distance, or for bearing off any die at least `from`. */
function diceFor(pool: number[], from: number, to: number): number[] {
  const dice = to === OFF ? [...new Set(pool)].filter((d) => d >= from) : [from - to];
  return dice.filter((d) => pool.includes(d)).sort((a, b) => a - b);
}

/** Applies a [from, to] list, trying every die assignment (bearing off can use several). */
function playOut(v: View, pool: number[], play: number[][], i = 0): View | null {
  if (i === play.length) return v;
  const [from, to] = play[i] as [number, number];
  for (const die of diceFor(pool, from, to)) {
    const step = singleStep(v, from, die);
    if (!step || step.to !== to) continue;
    const out = playOut(applyStep(v, step), removeOne(pool, die), play, i + 1);
    if (out) return out;
  }
  return null;
}

export interface Target {
  to: number;
  die: number;
}

/**
 * Builds one turn step by step. `legal` is the server's list of legal plays ([from, to] pairs in
 * the mover's numbering); any order of steps that reaches one of their final positions is allowed.
 */
export class TurnBuilder {
  readonly player: Player;
  private readonly start: View;
  private readonly finals: Set<string>;
  private readonly memo = new Map<string, boolean>();
  private readonly history: { view: View; dice: number[]; step: Step }[] = [];
  private current: View;
  private dice: number[];

  constructor(position: Position, player: Player, dice: [number, number], legal: number[][][]) {
    this.player = player;
    this.start = view(position, player);
    this.current = this.start;
    this.dice = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice];
    this.finals = new Set();
    for (const play of legal) {
      const final = playOut(this.start, this.dice, play);
      if (!final) throw new Error("server play does not apply");
      this.finals.add(key(final));
    }
  }

  /** Whether some legal play exists (false: the turn will pass). */
  get canMove(): boolean {
    return this.finals.size > 0;
  }

  get steps(): readonly Step[] {
    return this.history.map((h) => h.step);
  }

  get remainingDice(): readonly number[] {
    return this.dice;
  }

  /** The position after the steps taken so far. */
  get position(): Position {
    return fromView(this.player, this.current);
  }

  /** A legal final position is reached: the move can be confirmed. */
  get complete(): boolean {
    return this.finals.has(key(this.current));
  }

  /** Points (mover's numbering, 25 = bar) that have a checker with a legal next step. */
  sources(): number[] {
    const out: number[] = [];
    for (let from = BAR; from >= 1; from--) if (this.targets(from).length) out.push(from);
    return out;
  }

  /** Legal destinations for a checker on `from` (0 = off), each with the die it uses. */
  targets(from: number): Target[] {
    const seen = new Map<number, Target>();
    for (const die of [...new Set(this.dice)].sort((a, b) => a - b)) {
      const step = singleStep(this.current, from, die);
      if (!step || seen.has(step.to)) continue;
      if (this.reaches(applyStep(this.current, step), removeOne(this.dice, die))) seen.set(step.to, { to: step.to, die });
    }
    return [...seen.values()];
  }

  /** Makes a step; throws when it cannot lead to a legal play. */
  move(from: number, to: number): Step {
    const step = this.resolve(this.current, this.dice, from, to);
    if (!step) throw new Error("illegal step");
    this.history.push({ view: this.current, dice: this.dice, step });
    this.current = applyStep(this.current, step);
    this.dice = removeOne(this.dice, step.die);
    return step;
  }

  undo(): Step | null {
    const last = this.history.pop();
    if (!last) return null;
    this.current = last.view;
    this.dice = last.dice;
    return last.step;
  }

  reset(): void {
    while (this.undo());
  }

  /** The [from, to] list to send with `turn.move`. */
  moves(): number[][] {
    return this.history.map((h) => [h.step.from, h.step.to]);
  }

  private resolve(v: View, pool: number[], from: number, to: number): Step | null {
    for (const die of diceFor(pool, from, to)) {
      const step = singleStep(v, from, die);
      if (step && step.to === to && this.reaches(applyStep(v, step), removeOne(pool, die))) return step;
    }
    return null;
  }

  private reaches(v: View, pool: number[]): boolean {
    const k = `${key(v)}#${[...pool].sort().join("")}`;
    const cached = this.memo.get(k);
    if (cached !== undefined) return cached;
    let ok = this.finals.has(key(v)) && (pool.length === 0 || v.mine[OFF] === CHECKERS || !this.anyStep(v, pool));
    if (!ok) {
      for (const die of new Set(pool)) {
        for (let from = BAR; from >= 1 && !ok; from--) {
          const step = singleStep(v, from, die);
          if (step && this.reaches(applyStep(v, step), removeOne(pool, die))) ok = true;
        }
        if (ok) break;
      }
    }
    this.memo.set(k, ok);
    return ok;
  }

  private anyStep(v: View, pool: number[]): boolean {
    for (const die of new Set(pool)) for (let from = BAR; from >= 1; from--) if (singleStep(v, from, die)) return true;
    return false;
  }
}

/** Encoded final positions of the server's legal plays (for tests and replays). */
export function finalsOf(position: Position, player: Player, dice: [number, number], legal: number[][][]): Set<string> {
  const pool = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice];
  const out = new Set<string>();
  for (const play of legal) {
    const final = playOut(view(position, player), pool, play);
    if (final) out.add(encode(fromView(player, final)));
  }
  return out;
}
