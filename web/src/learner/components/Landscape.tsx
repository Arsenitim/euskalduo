import { memo } from 'react';

/**
 * The home landscape, from the mountains down to the sea: peaks, a band of
 * beech and pine forest, fields with a baserri and sheep, painted harbour
 * houses on a stone quay. 1200 units wide so it fills a desktop screen; on a
 * phone the middle part shows (the SVG is cropped to its centre).
 */
const W = 1200;
const H = 200;
const SHUTTERS = ['#2f8f5b', '#c23a2b', '#1f6fb3', '#e0a21c', '#7a3e8c'];
const INK = '#13293d';

/** Deterministic, so the picture is the same on every visit and in tests. */
function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function Forest() {
  const r = random(7);
  const trees: React.ReactNode[] = [];
  for (let x = -6; x < W + 10; x += 9) {
    const y = 126 - 9 * Math.sin(x / 70) + r() * 5;
    const h = 15 + r() * 11;
    const fill = r() > 0.5 ? '#2f6b45' : '#3d8152';
    trees.push(
      r() > 0.45 ? (
        <path key={x} d={`M${x} ${y - h}L${(x + h * 0.38).toFixed(1)} ${y}L${(x - h * 0.38).toFixed(1)} ${y}Z`} fill={fill} />
      ) : (
        <ellipse key={x} cx={x} cy={(y - h * 0.5).toFixed(1)} rx={(h * 0.42).toFixed(1)} ry={(h * 0.52).toFixed(1)} fill={fill} />
      ),
    );
  }
  return <g>{trees}</g>;
}

function Houses() {
  const r = random(3);
  const base = 186;
  const out: React.ReactNode[] = [];
  let x = -4;
  let i = 0;
  while (x < W + 4) {
    const w = 24 + r() * 10;
    const h = 30 + r() * 16;
    const c = SHUTTERS[i % SHUTTERS.length];
    const top = base - h;
    out.push(
      <g key={i}>
        <rect x={x} y={top} width={w} height={h} fill="#fff" stroke={INK} strokeWidth={0.8} />
        <path d={`M${x - 1.5} ${top}L${x + w / 2} ${top - 9}L${x + w + 1.5} ${top}Z`} fill="#b8472c" stroke={INK} strokeWidth={0.8} />
        {[0, 1].map((row) =>
          [0, 1].map((col) => <rect key={`${row}${col}`} x={x + 4 + col * (w / 2 - 1)} y={top + 5 + row * 12} width={w / 2 - 7} height={8} rx={1} fill={c} />),
        )}
      </g>,
    );
    x += w;
    i++;
  }
  return <g>{out}</g>;
}

function Sheep({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={6} ry={4} fill="#fff" stroke={INK} strokeWidth={0.8} />
      <circle cx={6} cy={-1.5} r={2.3} fill={INK} />
    </g>
  );
}

function Baserri({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-22 0V-16L0-28L22-16V0Z" fill="#fff" stroke={INK} strokeWidth={1} />
      <path d="M-25-15L0-30L25-15" fill="none" stroke="#b8472c" strokeWidth={3.5} strokeLinejoin="round" />
      <rect x={-6} y={-11} width={12} height={11} fill="#7a4a22" />
      <rect x={-16} y={-13} width={6} height={5} fill="#c23a2b" />
      <rect x={10} y={-13} width={6} height={5} fill="#c23a2b" />
      <rect x={-3} y={-22} width={6} height={5} fill="#c23a2b" />
      <line x1={-22} y1={-16} x2={22} y2={-16} stroke="#7a4a22" strokeWidth={1.4} />
    </g>
  );
}

export const Landscape = memo(function Landscape() {
  return (
    <svg className="landscape" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <circle cx={760} cy={38} r={20} fill="#ffd45a" />
      <path d="M0 96L70 52L120 74L190 30L250 70L320 46L390 84L470 36L540 70L610 26L680 66L760 44L830 80L900 34L970 70L1040 48L1110 80L1200 50V130H0Z" fill="#9fb5cc" />
      <path d="M190 30L178 42L186 40L192 46L200 40ZM610 26L598 38L606 36L612 42L620 36ZM900 34L888 46L896 44L902 50L910 44Z" fill="#fff" opacity={0.85} />
      <path d="M0 112C120 84 220 104 330 92S560 74 680 96S900 80 1010 98S1150 88 1200 96V140H0Z" fill="#7f9bb8" />
      <path d="M0 122C200 104 420 118 600 112S1000 106 1200 116V150H0Z" fill="#24573a" />
      <Forest />
      <path d="M0 140C140 124 280 132 420 142S700 128 860 138S1100 130 1200 134V190H0Z" fill="#6fb36f" />
      <path d="M0 154C220 140 460 150 700 148S1060 144 1200 150V190H0Z" fill="#8cc58a" />
      <Baserri x={560} y={150} />
      <Baserri x={1010} y={146} />
      <Sheep x={630} y={156} />
      <Sheep x={650} y={160} />
      <Sheep x={520} y={162} />
      <Sheep x={300} y={154} />
      <Sheep x={930} y={156} />
      <Houses />
      <rect x={0} y={186} width={W} height={14} fill="#8f8a80" />
      <path d={Array.from({ length: Math.ceil(W / 14) }, (_, i) => `M${i * 14} 186v14`).join('')} stroke="#77726a" strokeWidth={1} />
    </svg>
  );
});
