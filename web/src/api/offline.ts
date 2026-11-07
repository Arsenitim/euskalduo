import type { HomeworkSet } from '../types';

/**
 * Offline mode, page side. The service worker (web/sw/sw.js) serves the app,
 * the catalogue and pictures/speech from these caches; this module fills
 * them on request ("Descargar para usar sin conexión") and reports what is
 * there. Everything downloaded is public content: the same files every
 * visitor gets, requested without cookies, query strings or learner data.
 *
 * Keep the cache names in sync with web/sw/sw.js.
 */
export const DATA_CACHE = 'euskalduo-data-v1';
export const MEDIA_CACHE = 'euskalduo-media-v1';
const CONTENT_URL = '/api/public/content';
const MEDIA_PATH = /^\/(uploads\/[a-f0-9]{32}\.webp|audio\/[a-f0-9]{64}\.mp3)$/;

export const offlineSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;

/** Registers the service worker (production builds only; never in dev). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !offlineSupported()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

/** Every picture and speech clip the catalogue refers to. */
export function mediaUrls(sets: HomeworkSet[]): string[] {
  const urls = new Set<string>();
  for (const set of sets) {
    for (const entry of set.entries) {
      for (const url of [entry.image, entry.audio]) if (url && MEDIA_PATH.test(url)) urls.add(url);
    }
  }
  return [...urls];
}

export interface OfflineStatus {
  /** The app itself is installed in the service worker. */
  app: boolean;
  /** When the saved catalogue was sent by the server, or null if none is saved. */
  savedAt: Date | null;
  total: number;
  missing: number;
}

const path = (request: Request) => new URL(request.url).pathname;

export async function offlineStatus(urls: string[]): Promise<OfflineStatus> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const content = await (await caches.open(DATA_CACHE)).match(CONTENT_URL, { ignoreVary: true });
  const have = new Set((await (await caches.open(MEDIA_CACHE)).keys()).map(path));
  const date = content?.headers.get('date');
  return {
    app: Boolean(registration?.active),
    savedAt: content ? (date ? new Date(date) : new Date()) : null,
    total: urls.length,
    missing: urls.filter((u) => !have.has(u)).length,
  };
}

/** Removes pictures and speech that are no longer in the catalogue. */
export async function pruneMedia(urls: string[]): Promise<void> {
  if (!offlineSupported()) return;
  const keep = new Set(urls);
  const cache = await caches.open(MEDIA_CACHE);
  await Promise.all((await cache.keys()).filter((r) => !keep.has(path(r))).map((r) => cache.delete(r)));
}

const plainGet = (url: string) => new Request(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' });

/**
 * Saves the catalogue and every missing picture/clip. Resolves with how many
 * files could not be downloaded (0 = everything is ready).
 */
export async function downloadForOffline(urls: string[], onProgress: (done: number, total: number) => void): Promise<number> {
  // Ask the browser not to clear these files (and the progress) when space runs low.
  await navigator.storage?.persist?.().catch(() => false);
  await (await caches.open(DATA_CACHE)).add(plainGet(CONTENT_URL));

  const cache = await caches.open(MEDIA_CACHE);
  const have = new Set((await cache.keys()).map(path));
  const todo = urls.filter((u) => !have.has(u));
  let done = 0;
  let failed = 0;
  onProgress(0, todo.length);
  const queue = [...todo];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      await cache.add(plainGet(url)).catch(() => failed++);
      onProgress(++done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await pruneMedia(urls);
  return failed;
}
