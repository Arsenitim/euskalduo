/**
 * The lesson progress bar: a trainera (Basque rowing boat) rows across the
 * sea towards the harbour, one stroke per question. The strip is a real
 * progressbar for assistive tech; the boat, houses and dots are decoration.
 */
export function SeaProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="sea" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <Harbour />
      <span className="sea-wake" aria-hidden="true" style={{ width: `calc(${share} * (100% - var(--sea-route)))` }} />
      <span className="sea-boat" aria-hidden="true" style={{ left: `calc(var(--sea-start) + ${share} * (100% - var(--sea-route)))` }}>
        <Trainera />
      </span>
      {max > 0 && max <= 24 && (
        <span className="sea-dots" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={i < value ? 'on' : undefined} />
          ))}
        </span>
      )}
    </div>
  );
}

function Trainera() {
  const rowers = [-22, -13, -4, 5, 14, 23];
  return (
    <svg className="trainera" viewBox="-38 -9 78 22" focusable="false">
      <g className="trainera-bob">
        {rowers.map((x) => (
          <line key={`o${x}`} x1={x} y1={1} x2={x - 7} y2={11} stroke="#7a4a22" strokeWidth={1.4} strokeLinecap="round" />
        ))}
        <path d="M-34 0 Q0 9 36 -2 L30 5 Q0 12 -30 5 Z" fill="#c23a2b" stroke="#13293d" strokeWidth={1.3} strokeLinejoin="round" />
        {rowers.map((x) => (
          <circle key={`r${x}`} cx={x} cy={-3} r={2.5} fill="#13293d" />
        ))}
        <circle cx={31} cy={-4.5} r={2.7} fill="#13293d" />
      </g>
    </svg>
  );
}

/** Three painted harbour houses on a stone quay. */
function Harbour() {
  const houses = [
    { x: 0, w: 22, h: 34, c: '#7a3e8c' },
    { x: 22, w: 26, h: 28, c: '#c23a2b' },
    { x: 48, w: 24, h: 38, c: '#1f6fb3' },
  ];
  return (
    <svg className="harbour" viewBox="-2 -9 76 56" focusable="false" aria-hidden="true">
      {houses.map(({ x, w, h, c }) => (
        <g key={x}>
          <rect x={x} y={40 - h} width={w} height={h} fill="#fff" stroke="#13293d" strokeWidth={0.9} />
          <path d={`M${x - 1.5} ${40 - h} L${x + w / 2} ${31 - h} L${x + w + 1.5} ${40 - h} Z`} fill="#b8472c" stroke="#13293d" strokeWidth={0.9} />
          {[0, 1].map((row) =>
            [0, 1].map((col) => <rect key={`${row}${col}`} x={x + 3.5 + col * (w / 2 - 1)} y={44 - h + row * 11} width={w / 2 - 6} height={7} rx={1} fill={c} />),
          )}
        </g>
      ))}
      <rect x={-2} y={40} width={78} height={6} fill="#8f8a80" />
    </svg>
  );
}
