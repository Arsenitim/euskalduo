import { useEffect, useRef, useState } from 'react';
import lagundu from '../assets/lagundu.mp3';
import { playClip } from '../voice';

/**
 * The lesson progress bar: a trainera (Basque rowing boat) rows across the
 * sea towards the harbour, one stroke per question. The strip is a real
 * progressbar for assistive tech; the boat, houses and dots are decoration.
 */
export function SeaProgress({ value, max, label }: { value: number; max: number; label?: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  // Without a label it is decoration only (the round summary: the boat is home).
  const a11y = label ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label } : { 'aria-hidden': true };
  return (
    <div className="sea" {...a11y}>
      <Harbour />
      <span className="sea-wake" aria-hidden="true" style={{ width: `calc(${share} * (100% - var(--sea-route)))` }} />
      <Boat left={`calc(var(--sea-start) + ${share} * (100% - var(--sea-route)))`} nearHarbour={share > 0.5} />
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

/** How long the sheep's trip overboard lasts; matches `sheep-overboard` in styles.css. */
const OVERBOARD_MS = 2600;
/** Taps closer together than this count as one series (1, 2, 3). */
const TAP_GAP_MS = 1200;

/**
 * The boat, with a small secret: tap it and it rocks, tap twice and it rocks
 * harder, tap three times and Txapi falls overboard shouting "Lagundu!"
 * ("help!") until the crew pulls the sheep back in. Decoration only, so it
 * stays hidden from assistive tech.
 */
function Boat({ left, nearHarbour }: { left: string; nearHarbour: boolean }) {
  const [shake, setShake] = useState({ level: 0, id: 0 });
  const series = useRef({ count: 0, last: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tap = () => {
    if (shake.level === 3) return; // the sheep is still in the water
    const now = Date.now();
    const count = now - series.current.last < TAP_GAP_MS ? series.current.count + 1 : 1;
    series.current = { count: count >= 3 ? 0 : count, last: now };
    setShake((s) => ({ level: Math.min(count, 3), id: s.id + 1 }));
    if (count >= 3) {
      playClip(lagundu);
      timer.current = setTimeout(() => setShake((s) => ({ level: 0, id: s.id + 1 })), OVERBOARD_MS);
    }
  };

  return (
    <span className="sea-boat" aria-hidden="true" style={{ left }} onClick={tap} data-shake={shake.level || undefined}>
      <Trainera key={shake.id} />
      {shake.level === 3 && <span className={nearHarbour ? 'boat-shout boat-shout-left' : 'boat-shout'}>Lagundu!</span>}
    </span>
  );
}

function Trainera() {
  // Six rowers and the cox; Triku and Txapi take two of the seats.
  const rowers = [-22, -13, -4, 5, 14, 23];
  const TRIKU = -13;
  const TXAPI = 14;
  return (
    <svg className="trainera" viewBox="-38 -9 78 22" focusable="false">
      <g className="trainera-shake">
        <g className="trainera-bob">
          {rowers.map((x) => (
            <line key={`o${x}`} x1={x} y1={1} x2={x - 7} y2={11} stroke="#7a4a22" strokeWidth={1.4} strokeLinecap="round" />
          ))}
          <path d="M-34 0 Q0 9 36 -2 L30 5 Q0 12 -30 5 Z" fill="#c23a2b" stroke="#13293d" strokeWidth={1.3} strokeLinejoin="round" />
          {rowers
            .filter((x) => x !== TRIKU && x !== TXAPI)
            .map((x) => (
              <circle key={`r${x}`} cx={x} cy={-3} r={2.5} fill="#13293d" />
            ))}
          <circle cx={31} cy={-4.5} r={2.7} fill="#13293d" />
          <TinyTriku x={TRIKU} />
          <TinyTxapi x={TXAPI} />
        </g>
      </g>
    </svg>
  );
}

/** Triku the hedgehog, a few units tall: brown spikes and a cream face. */
function TinyTriku({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} -3.6)`}>
      <path
        d="M-3.4 1.6 L-4.9 -0.4 L-3.3 -1.4 L-3.9 -3.5 L-1.8 -3.4 L-1.2 -5.3 L0.4 -3.9 L2 -5.1 L2.6 -3.1 L4.6 -2.9 L3.8 -0.9 L5 0.8 L3.4 1.6 Z"
        fill="#6e4226"
        stroke="#13293d"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <circle r={3} fill="#9a6238" />
      <ellipse cx={0.6} cy={0.9} rx={2} ry={1.7} fill="#f6dcb4" />
      <circle cx={-0.2} cy={0.3} r={0.42} fill="#13293d" />
      <circle cx={1.3} cy={0.3} r={0.42} fill="#13293d" />
      <circle cx={0.6} cy={1.5} r={0.5} fill="#13293d" />
    </g>
  );
}

/** Txapi the sheep in a txapela: white wool, a dark face and a black beret. */
function TinyTxapi({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} -3.6)`}>
      <g className="boat-sheep">
        <circle className="boat-ring" r={4.6} fill="none" stroke="#e8562a" strokeWidth={1.4} strokeDasharray="2.4 1.2" />
        <g fill="#fff" stroke="#13293d" strokeWidth={0.55}>
          <circle cx={-1.9} cy={-0.6} r={1.9} />
          <circle cx={1.9} cy={-0.6} r={1.9} />
          <circle cx={0} cy={0.8} r={2.4} />
        </g>
        <circle cx={-1.9} cy={-0.6} r={1.6} fill="#fff" />
        <circle cx={1.9} cy={-0.6} r={1.6} fill="#fff" />
        <ellipse cx={0.3} cy={0.6} rx={1.5} ry={1.8} fill="#4a4452" />
        <circle cx={-0.3} cy={0.2} r={0.38} fill="#fff" />
        <circle cx={0.9} cy={0.2} r={0.38} fill="#fff" />
        <ellipse cx={0.2} cy={-1.9} rx={2.7} ry={0.95} fill="#1f1d24" />
        <rect x={0} y={-3.3} width={0.6} height={0.9} rx={0.2} fill="#1f1d24" />
      </g>
      <g className="boat-splash" fill="none" stroke="#fff" strokeWidth={0.8} strokeLinecap="round">
        <path d="M14 18 q2 -3 4 0 M21 18 q2 -3 4 0" />
      </g>
    </g>
  );
}

/** Three painted harbour houses on a stone quay. */
export function Harbour() {
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
