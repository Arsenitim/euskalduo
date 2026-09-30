import type { MascotKind, MascotState } from '../mascot';

/**
 * The two mascots, Triku the hedgehog and Txapi the sheep in a txapela.
 * Drawn as SVG out of separate parts (arms, eyes, mouth, spikes, ears,
 * beret) so CSS can move each one: styles.css picks the face and pose for
 * `data-state` and plays the animation once when the mascot mounts.
 */
export function Mascot({ kind, state, className }: { kind: MascotKind; state: MascotState; className?: string }) {
  return (
    <svg className={`mascot ${className ?? ''}`} data-kind={kind} data-state={state} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <ellipse className="shadow" cx="100" cy="185" rx="46" ry="6" />
      <g className="breath">
        <g className="rig">{kind === 'hedgehog' ? <HedgehogBody /> : <SheepBody />}</g>
      </g>
      {kind === 'hedgehog' ? <Props q={[154, 58]} sweat={[142, 100]} tear={[84, 133]} cloud={[146, 74]} /> : <Props q={[156, 52]} sweat={[132, 92]} tear={[89, 121]} cloud={[148, 64]} />}
    </svg>
  );
}

function point(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${(100 + r * Math.cos(a)).toFixed(1)} ${(118 + r * Math.sin(a)).toFixed(1)}`;
}

/** A fan of rounded triangles around the hedgehog's body. */
function spikePath(from: number, to: number, step: number, half: number, r0: number, r1: number): string {
  let d = '';
  for (let a = from; a <= to; a += step) d += `M${point(r0, a - half)} L${point(r1, a)} L${point(r0, a + half)} Z `;
  return d;
}

const SPIKES_BACK = spikePath(147, 393, 23, 17, 46, 80);
const SPIKES_FRONT = spikePath(158.5, 381.5, 23, 17, 46, 72);

function HedgehogBody() {
  return (
    <>
      <ellipse className="ol" cx="82" cy="174" rx="15" ry="9" fill="var(--m-spike-dark)" />
      <ellipse className="ol" cx="118" cy="174" rx="15" ry="9" fill="var(--m-spike-dark)" />
      <g className="spikes">
        <path className="ol" fill="var(--m-spike-dark)" d={SPIKES_BACK} />
        <path className="ol" fill="var(--m-spike)" d={SPIKES_FRONT} />
      </g>
      <circle className="ol" cx="100" cy="118" r="52" fill="var(--m-spike)" />
      <circle className="ol" cx="72" cy="80" r="9" fill="var(--m-cream)" />
      <circle cx="72" cy="80" r="4.5" fill="var(--m-pink)" />
      <circle className="ol" cx="128" cy="80" r="9" fill="var(--m-cream)" />
      <circle cx="128" cy="80" r="4.5" fill="var(--m-pink)" />
      <path className="ol" fill="var(--m-cream)" d="M100 98 C 82 84, 60 94, 63 124 C 66 152, 84 168, 100 168 C 116 168, 134 152, 137 124 C 140 94, 118 84, 100 98 Z" />
      <ellipse cx="76" cy="140" rx="7" ry="4.5" fill="var(--m-pink)" opacity=".7" />
      <ellipse cx="124" cy="140" rx="7" ry="4.5" fill="var(--m-pink)" opacity=".7" />
      <g className="eyes-open">
        <g className="eye-l">
          <ellipse cx="86" cy="121" rx="5.5" ry="7.5" fill="var(--m-ink)" />
          <circle cx="88" cy="118" r="2" fill="#fff" />
        </g>
        <g className="eye-r">
          <ellipse cx="114" cy="121" rx="5.5" ry="7.5" fill="var(--m-ink)" />
          <circle cx="116" cy="118" r="2" fill="#fff" />
        </g>
      </g>
      <g className="eyes-happy">
        <path className="line eye-l" d="M79 123 Q86 112 93 123" />
        <path className="line eye-r" d="M107 123 Q114 112 121 123" />
      </g>
      <g className="brows-sad">
        <path className="line" d="M78 109 L93 104" />
        <path className="line" d="M107 104 L122 109" />
      </g>
      <g className="brows-up">
        <path className="line" d="M79 108 Q86 102 93 108" />
        <path className="line" d="M107 108 Q114 102 121 108" />
      </g>
      <ellipse cx="100" cy="136" rx="7" ry="5" fill="var(--m-ink)" />
      <ellipse cx="98" cy="134.5" rx="2.2" ry="1.4" fill="#fff" opacity=".8" />
      <path className="line mouth-smile" d="M92 146 Q100 153 108 146" />
      <g className="mouth-grin">
        <path className="ol" style={{ strokeWidth: 3.5 }} fill="var(--m-mouth)" d="M88 145 L112 145 Q109 160 100 160 Q91 160 88 145 Z" />
        <path fill="var(--m-pink)" d="M94 156 Q100 151 106 156 Q103 159 100 159 Q97 159 94 156 Z" />
      </g>
      <path className="line mouth-frown" d="M92 153 Q100 145 108 153" />
      <path className="line mouth-wavy" d="M90 149 Q95 145 100 149 Q105 153 110 149" />
      <ellipse className="ol mouth-o" style={{ strokeWidth: 3 }} cx="100" cy="150" rx="4" ry="5" fill="var(--m-mouth)" />
      <g className="arm-l">
        <rect className="ol" x="48" y="130" width="16" height="30" rx="8" fill="var(--m-paw)" transform="rotate(28 56 132)" />
      </g>
      <g className="arm-r">
        <rect className="ol" x="136" y="130" width="16" height="30" rx="8" fill="var(--m-paw)" transform="rotate(-28 144 132)" />
      </g>
    </>
  );
}

const WOOL: [number, number][] = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2;
  return [100 + 42 * Math.cos(a), 130 + 30 * Math.sin(a)];
});
const TUFT: [number, number, number][] = [
  [87, 84, 9],
  [100, 81, 10],
  [113, 84, 9],
];

/** Puffs drawn twice: a thick outline layer, then plain fills that hide the inner outlines. */
function Fluff({ puffs, core }: { puffs: [number, number, number][]; core?: [number, number, number, number] }) {
  const shapes = (
    <>
      {puffs.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={r} />
      ))}
      {core && <ellipse cx={core[0]} cy={core[1]} rx={core[2]} ry={core[3]} />}
    </>
  );
  return (
    <>
      <g fill="var(--m-wool)" stroke="var(--m-ink)" strokeWidth="8">
        {shapes}
      </g>
      <g fill="var(--m-wool)">{shapes}</g>
    </>
  );
}

function SheepBody() {
  return (
    <>
      <rect className="ol" x="80" y="156" width="13" height="28" rx="5" fill="var(--m-hoof)" />
      <rect className="ol" x="107" y="156" width="13" height="28" rx="5" fill="var(--m-hoof)" />
      <Fluff puffs={WOOL.map(([x, y]) => [x, y, 20])} core={[100, 130, 40, 34]} />
      <g className="ear-l">
        <g transform="rotate(15 66 102)">
          <ellipse className="ol" cx="66" cy="102" rx="15" ry="7.5" fill="var(--m-face)" />
          <ellipse cx="64" cy="102" rx="8" ry="3.4" fill="var(--m-pink)" />
        </g>
      </g>
      <g className="ear-r">
        <g transform="rotate(-15 134 102)">
          <ellipse className="ol" cx="134" cy="102" rx="15" ry="7.5" fill="var(--m-face)" />
          <ellipse cx="136" cy="102" rx="8" ry="3.4" fill="var(--m-pink)" />
        </g>
      </g>
      <ellipse className="ol" cx="100" cy="107" rx="26" ry="29" fill="var(--m-face)" />
      <Fluff puffs={TUFT} />
      <ellipse cx="80" cy="123" rx="6" ry="3.8" fill="var(--m-pink)" opacity=".75" />
      <ellipse cx="120" cy="123" rx="6" ry="3.8" fill="var(--m-pink)" opacity=".75" />
      <g className="eyes-open">
        <g className="eye-l">
          <ellipse cx="89" cy="108" rx="7.5" ry="8.5" fill="#fff" />
          <circle cx="90" cy="110" r="4.2" fill="var(--m-ink)" />
          <circle cx="91.6" cy="108.3" r="1.5" fill="#fff" />
        </g>
        <g className="eye-r">
          <ellipse cx="111" cy="108" rx="7.5" ry="8.5" fill="#fff" />
          <circle cx="110" cy="110" r="4.2" fill="var(--m-ink)" />
          <circle cx="111.6" cy="108.3" r="1.5" fill="#fff" />
        </g>
      </g>
      <g className="eyes-happy">
        <path className="fline eye-l" d="M82 111 Q89 101 96 111" />
        <path className="fline eye-r" d="M104 111 Q111 101 118 111" />
      </g>
      <g className="brows-sad">
        <path className="fline" d="M81 99 L95 94" />
        <path className="fline" d="M105 94 L119 99" />
      </g>
      <g className="brows-up">
        <path className="fline" d="M82 97 Q89 91 96 97" />
        <path className="fline" d="M104 97 Q111 91 118 97" />
      </g>
      <ellipse cx="100" cy="122" rx="5.5" ry="3.8" fill="var(--m-pink)" />
      <path className="fline mouth-smile" d="M93 129 Q100 135 107 129" />
      <g className="mouth-grin">
        <path fill="var(--m-mouth)" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" d="M90 128 L110 128 Q107 141 100 141 Q93 141 90 128 Z" />
        <path fill="var(--m-pink)" d="M95 137 Q100 133 105 137 Q103 140 100 140 Q97 140 95 137 Z" />
      </g>
      <path className="fline mouth-frown" d="M93 135 Q100 128 107 135" />
      <path className="fline mouth-wavy" d="M91 132 Q95.5 128 100 132 Q104.5 136 109 132" />
      <ellipse className="mouth-o" cx="100" cy="132" rx="3.5" ry="4.5" fill="var(--m-mouth)" stroke="#fff" strokeWidth="2.5" />
      <g className="beret">
        <g transform="rotate(-8 100 72)">
          <path className="ol" fill="var(--m-beret)" d="M56 80 C 56 62, 78 56, 100 56 C 122 56, 146 62, 146 78 C 146 86, 124 88, 100 88 C 76 88, 56 88, 56 80 Z" />
          <path d="M68 71 Q82 62 98 61" fill="none" stroke="var(--m-beret-sheen)" strokeWidth="3.5" strokeLinecap="round" />
          <path className="line" d="M100 57 L102 48" />
        </g>
      </g>
      <g className="arm-l">
        <g transform="rotate(24 64 136)">
          <rect className="ol" x="56" y="134" width="16" height="28" rx="8" fill="var(--m-wool)" />
          <rect x="58" y="153" width="12" height="7" rx="3" fill="var(--m-hoof)" />
        </g>
      </g>
      <g className="arm-r">
        <g transform="rotate(-24 136 136)">
          <rect className="ol" x="128" y="134" width="16" height="28" rx="8" fill="var(--m-wool)" />
          <rect x="130" y="153" width="12" height="7" rx="3" fill="var(--m-hoof)" />
        </g>
      </g>
    </>
  );
}

function Star({ x, y, s }: { x: number; y: number; s: number }) {
  return <path className="spark ol" style={{ strokeWidth: 3 }} fill="var(--m-star)" d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`} />;
}

function Drop({ name, at: [x, y], scale }: { name: 'sweat' | 'tear'; at: [number, number]; scale: number }) {
  return (
    <g className={`p-${name}`}>
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <path className={`${name} ol`} style={{ strokeWidth: 2.5 / scale }} fill="var(--m-water)" d="M0 -8 Q7 2 0 7 Q-7 2 0 -8 Z" />
      </g>
    </g>
  );
}

type Pt = [number, number];

function Props({ q, sweat, tear, cloud }: { q: Pt; sweat: Pt; tear: Pt; cloud: Pt }) {
  return (
    <>
      <g className="p-spark">
        <Star x={26} y={50} s={11} />
        <Star x={174} y={44} s={9} />
        <Star x={184} y={114} s={7} />
        <Star x={16} y={112} s={8} />
      </g>
      <text className="p-q" x={q[0]} y={q[1]}>
        ?
      </text>
      <Drop name="sweat" at={sweat} scale={1.2} />
      <Drop name="tear" at={tear} scale={0.9} />
      <g className="p-cloud">
        <path className="cloud ol" style={{ strokeWidth: 3 }} fill="var(--m-cloud)" d={`M${cloud[0]} ${cloud[1]} a9 9 0 0 1 12 -9 a11 11 0 0 1 20 2 a8 8 0 0 1 4 15 h-32 a8 8 0 0 1 -4 -8 Z`} />
      </g>
    </>
  );
}
