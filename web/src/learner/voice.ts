import { fetchAudio } from '../api/audio';

/** One cancellable speech sequence. All media stays on the app's origin. */
let generation = 0;
let active: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let enabled = true;
let objectUrl: string | null = null;

export function stopVoice(): void {
  generation++;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  if (active) {
    active.onended = active.onerror = null;
    active.pause();
    active.removeAttribute('src');
    active.load();
    active = null;
  }
}

export function setVoiceEnabled(value: boolean): void {
  enabled = value;
  if (!value) stopVoice();
}

export function playVoice(urls: (string | null | undefined)[], delay = 0): void {
  stopVoice();
  if (!enabled || typeof Audio === 'undefined' || (typeof document !== 'undefined' && document.hidden)) return;
  const sequence = urls.filter((url): url is string => !!url && /^\/audio\/[a-f0-9]{64}\.mp3$/.test(url));
  const token = generation;
  const next = () => {
    if (token !== generation || !enabled) return;
    if (active) active.onended = active.onerror = null;
    const url = sequence.shift();
    if (!url) { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; active = null; return; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    const player = new Audio();
    active = player;
    player.preload = 'auto';
    player.onended = next;
    player.onerror = next;
    void fetchAudio(url).then((blob) => {
      if (token !== generation || !enabled) return;
      objectUrl = URL.createObjectURL(blob);
      player.src = objectUrl;
      return player.play().catch(() => { if (token === generation && active === player) stopVoice(); });
    }).catch(() => { if (token === generation) next(); });
  };
  if (delay > 0) timer = setTimeout(next, delay);
  else next();
}
