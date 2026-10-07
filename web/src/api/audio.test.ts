import { afterEach, expect, it, vi } from 'vitest';
import { fetchAudio } from './audio';
afterEach(() => vi.unstubAllGlobals());
it('omits cookies and referrers and reuses the same clip', async () => {
  const request = vi.fn().mockResolvedValue(new Response(new Blob(['clip'])));
  vi.stubGlobal('fetch', request);
  const url = `/audio/${'c'.repeat(64)}.mp3`;
  await fetchAudio(url);
  await fetchAudio(url);
  expect(request).toHaveBeenCalledExactlyOnceWith(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
});
it('retries missing audio rather than caching a rejected request', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(new Blob(['clip'])));
  vi.stubGlobal('fetch', request);
  const url = `/audio/${'d'.repeat(64)}.mp3`;
  await expect(fetchAudio(url)).rejects.toThrow('Audio unavailable');
  await expect(fetchAudio(url)).resolves.toBeInstanceOf(Blob);
  expect(request).toHaveBeenCalledTimes(2);
});
it('rejects external or non-audio URLs before requesting them', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  await expect(fetchAudio('https://example.com/voice.mp3')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
