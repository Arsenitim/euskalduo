/** Static speech only: no cookies, referrer, learner identifiers, or answers. */
const clips = new Map<string, Promise<Blob>>();
export function fetchAudio(url: string): Promise<Blob> {
  if (!/^\/audio\/[a-f0-9]{64}\.mp3$/.test(url)) return Promise.reject(new Error('Invalid audio URL'));
  const existing = clips.get(url);
  if (existing) return existing;
  const request = fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((response) => { if (!response.ok) throw new Error('Audio unavailable'); return response.blob(); })
    .catch((error: unknown) => { clips.delete(url); throw error; });
  if (clips.size >= 8) clips.delete(clips.keys().next().value!);
  clips.set(url, request);
  return request;
}
