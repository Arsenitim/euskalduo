import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAudio } from '../api/audio';
import { playVoice, setVoiceEnabled, stopVoice } from './voice';
vi.mock('../api/audio', () => ({ fetchAudio: vi.fn() }));
const first = `/audio/${'a'.repeat(64)}.mp3`;
const second = `/audio/${'b'.repeat(64)}.mp3`;
const players: FakeAudio[] = [];
class FakeAudio {
  src = '';
  preload = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  constructor() { players.push(this); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.useFakeTimers();
  players.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:clip'), revokeObjectURL: vi.fn() });
  vi.mocked(fetchAudio).mockReset().mockResolvedValue(new Blob());
  setVoiceEnabled(true);
});
afterEach(() => { stopVoice(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('voice sequencing', () => {
  it('waits for the effect and plays ordered clips in sequence', async () => {
    playVoice([first, second], 550);
    vi.advanceTimersByTime(549);
    expect(fetchAudio).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await flush();
    expect(players[0]!.play).toHaveBeenCalledOnce();
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    players[0]!.onended?.();
    await flush();
    expect(fetchAudio).toHaveBeenLastCalledWith(second);
    expect(players[1]!.play).toHaveBeenCalledOnce();
  });
  it('mute cancels pending effects and speech, including an in-flight fetch', async () => {
    playVoice([first], 550);
    setVoiceEnabled(false);
    vi.runAllTimers();
    expect(fetchAudio).not.toHaveBeenCalled();
    setVoiceEnabled(true);
    let finish!: (blob: Blob) => void;
    vi.mocked(fetchAudio).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    playVoice([first]);
    setVoiceEnabled(false);
    finish(new Blob());
    await flush();
    expect(players[0]!.play).not.toHaveBeenCalled();
    expect(players[0]!.pause).toHaveBeenCalled();
  });
  it('replay replaces active speech and skips unavailable clips', async () => {
    playVoice([first]);
    await flush();
    vi.mocked(fetchAudio).mockRejectedValueOnce(new Error('404'));
    playVoice([first, second]);
    await flush();
    await flush();
    expect(players[0]!.pause).toHaveBeenCalledOnce();
    expect(fetchAudio).toHaveBeenLastCalledWith(second);
    expect(players[2]!.play).toHaveBeenCalledOnce();
  });
  it('blocked autoplay is quiet and does not keep advancing the queue', async () => {
    playVoice([first, second]);
    players[0]!.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    await flush();
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(players[0]!.pause).toHaveBeenCalled();
  });
});
