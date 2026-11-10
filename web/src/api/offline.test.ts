import { describe, expect, it } from 'vitest';
import type { HomeworkSet } from '../types';
import { mediaUrls } from './offline';

const image = `/uploads/${'a'.repeat(32)}.webp`;
const audio = `/audio/${'b'.repeat(64)}.mp3`;
const entry = (id: string, img: string | null, clip: string | null) => ({
  id, basque: id, translations: { es: [id] }, note: null, group: null, emoji: null, image: img, audio: clip,
});

describe('offline download list', () => {
  it('collects each picture and speech clip once, and only same-site content files', () => {
    const sets = [
      { id: 'a', entries: [entry('x', image, audio), entry('y', image, null)] },
      { id: 'b', entries: [entry('z', 'https://example.com/p.webp', '/audio/../secret.mp3'), entry('w', null, null)] },
    ] as unknown as HomeworkSet[];
    expect(mediaUrls(sets)).toEqual([image, audio]);
  });

  it('includes story recordings, so a full download covers listening too', () => {
    const story = `/audio/${'c'.repeat(64)}.mp3`;
    expect(mediaUrls([], [{ audio: story }, { audio: story }, { audio: 'https://example.com/x.mp3' }])).toEqual([story]);
  });
});
