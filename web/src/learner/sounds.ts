/**
 * Answer sound effects, synthesised with the Web Audio API: no audio files,
 * no network requests. All functions are silent no-ops where audio is not
 * available (older browsers, tests, blocked autoplay).
 */

type Wave = OscillatorType;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** One note with a quick attack and exponential "bell" decay. */
function note(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number, wave: Wave, glideTo?: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Bright rising chime: E6 – G#6 – B6 with a soft octave shimmer. */
export function playCorrect(): void {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  [1318.5, 1661.2, 1975.5].forEach((f, i) => {
    note(ctx, f, t + i * 0.075, 0.32, 0.11, 'triangle');
    note(ctx, f * 2, t + i * 0.075, 0.18, 0.025, 'sine');
  });
}

/** Soft, low descending "boop-boop" — gentle, not a buzzer. */
export function playWrong(): void {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  note(ctx, 311.1, t, 0.2, 0.12, 'sine', 293.7);
  note(ctx, 233.1, t + 0.17, 0.32, 0.12, 'sine', 220);
}

/** Little fanfare at the end of a round: C – E – G – C with a final sparkle. */
export function playRoundDone(): void {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => note(ctx, f, t + i * 0.11, i === 3 ? 0.7 : 0.22, 0.1, 'triangle'));
  note(ctx, 2093, t + 0.45, 0.5, 0.03, 'sine');
  note(ctx, 2637, t + 0.52, 0.45, 0.025, 'sine');
}
