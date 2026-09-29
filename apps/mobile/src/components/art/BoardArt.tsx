import { boardDefaultTheme as b } from "@bg/design-tokens";

// Static, decorative board illustration for the welcome screen and the auth art pane (auth.md
// AU-01: no 3D and no WebGL on these routes). Original artwork drawn from primitives in the
// default "Walnut & Brass" theme colors: walnut frame, maple field, alternating points, a khatam
// star inlay on the bar, checkers in the opening position, and two dice. Always aria-hidden.
// Like the 3D board, it never mirrors in RTL.

const W = 400;
const H = 280;
const EDGE = 22;
const BAR = 24;
const HALF = (W - EDGE * 2 - BAR) / 2; // width of one half of the field
const POINT_W = HALF / 6;
const POINT_H = 100;
const R = 11;

/** x center of a point column: half 0 = left, 1 = right; col 0…5 from the left. */
function colX(half: 0 | 1, col: number): number {
  const start = EDGE + half * (HALF + BAR);
  return start + POINT_W * col + POINT_W / 2;
}

type Side = "light" | "dark";
interface Stack {
  half: 0 | 1;
  col: number;
  top: boolean;
  count: number;
  side: Side;
}

// Opening position, light player's home at the bottom right.
const STACKS: Stack[] = [
  { half: 1, col: 5, top: true, count: 2, side: "light" },
  { half: 0, col: 0, top: true, count: 5, side: "light" },
  { half: 0, col: 4, top: false, count: 3, side: "light" },
  { half: 1, col: 0, top: false, count: 5, side: "light" },
  { half: 1, col: 5, top: false, count: 2, side: "dark" },
  { half: 0, col: 0, top: false, count: 5, side: "dark" },
  { half: 0, col: 4, top: true, count: 3, side: "dark" },
  { half: 1, col: 0, top: true, count: 5, side: "dark" },
];

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const radius = i % 2 === 0 ? r : r * 0.55;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function Die({ x, y, rotate, pips }: { x: number; y: number; rotate: number; pips: [number, number][] }) {
  const s = 26;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={5} fill={b.diceBody} stroke={b.checkerLightRim} strokeWidth={1} />
      {pips.map(([px, py], i) => (
        <circle key={i} cx={px * 7} cy={py * 7} r={2.3} fill={b.dicePip} />
      ))}
    </g>
  );
}

export function BoardArt({ className }: { className?: string }) {
  const top = EDGE;
  const bottom = H - EDGE;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {/* Frame */}
      <rect x={0} y={0} width={W} height={H} rx={18} fill={b.frameWood} />
      <rect x={7} y={7} width={W - 14} height={H - 14} rx={13} fill="none" stroke={b.brass} strokeWidth={1.5} opacity={0.8} />
      {/* Field halves */}
      {[0, 1].map((half) => (
        <rect
          key={half}
          x={EDGE + half * (HALF + BAR)}
          y={top}
          width={HALF}
          height={bottom - top}
          rx={3}
          fill={b.fieldWood}
        />
      ))}
      {/* Points */}
      {[0, 1].flatMap((half) =>
        Array.from({ length: 6 }, (_, col) => {
          const x0 = EDGE + half * (HALF + BAR) + col * POINT_W;
          const x1 = x0 + POINT_W;
          const xm = x0 + POINT_W / 2;
          const dark = col % 2 === 0;
          return (
            <g key={`${half}-${col}`}>
              <polygon points={`${x0},${top} ${x1},${top} ${xm},${top + POINT_H}`} fill={dark ? b.pointDark : b.pointLight} />
              <polygon
                points={`${x0},${bottom} ${x1},${bottom} ${xm},${bottom - POINT_H}`}
                fill={dark ? b.pointLight : b.pointDark}
              />
            </g>
          );
        }),
      )}
      {/* Bar with brass hinges and a khatam star inlay */}
      <rect x={EDGE + HALF} y={top - 4} width={BAR} height={bottom - top + 8} fill={b.frameWood} />
      <rect x={EDGE + HALF + BAR / 2 - 3} y={top + 18} width={6} height={22} rx={2} fill={b.brass} />
      <rect x={EDGE + HALF + BAR / 2 - 3} y={bottom - 40} width={6} height={22} rx={2} fill={b.brass} />
      <polygon points={star(W / 2, H / 2, 10)} fill={b.inlayTurquoise} stroke={b.brass} strokeWidth={1.2} />
      {/* Checkers */}
      {STACKS.flatMap((stack) =>
        Array.from({ length: stack.count }, (_, i) => {
          const room = (bottom - top) / 2 - 4 - R * 2;
          const step = stack.count > 1 ? Math.min(R * 2, room / (stack.count - 1)) : 0;
          const cy = stack.top ? top + R + 1 + i * step : bottom - R - 1 - i * step;
          const light = stack.side === "light";
          return (
            <g key={`${stack.half}-${stack.col}-${stack.top}-${i}`}>
              <circle
                cx={colX(stack.half, stack.col)}
                cy={cy}
                r={R}
                fill={light ? b.checkerLight : b.checkerDark}
                stroke={light ? b.checkerLightRim : b.checkerDarkRim}
                strokeWidth={2}
              />
              <circle
                cx={colX(stack.half, stack.col)}
                cy={cy}
                r={R * 0.55}
                fill="none"
                stroke={light ? b.checkerLightRim : b.checkerDarkRim}
                strokeWidth={1}
                opacity={0.7}
              />
            </g>
          );
        }),
      )}
      {/* Dice */}
      <Die x={colX(1, 2) + 6} y={H / 2 + 4} rotate={-12} pips={[[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]} />
      <Die x={colX(1, 3) + 16} y={H / 2 - 6} rotate={9} pips={[[-1, -1], [0, 0], [1, 1]]} />
    </svg>
  );
}
