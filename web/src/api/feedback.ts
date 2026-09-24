/**
 * Feedback is the only thing the learner app ever sends, and only when
 * someone fills in the form and presses "Enviar". It carries what they typed,
 * an optional screenshot, the current screen (#/…) and the window size.
 * No cookies, no stored name or progress.
 */
export interface FeedbackInput {
  name: string;
  message: string;
  screenshot: Blob | null;
}

export type FeedbackResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'bad_image' | 'rate_limited' | 'too_big' | 'network' }
  | { ok: false; reason: 'full'; contact: string | null };

export const MAX_MESSAGE = 5000;
const SCREENSHOT_SIDE = 1600;

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const body = new FormData();
  if (input.name.trim()) body.set('name', input.name.trim());
  body.set('message', input.message);
  body.set('page', window.location.hash || '#/');
  body.set('viewport', `${window.innerWidth}x${window.innerHeight}`);
  if (input.screenshot) body.set('screenshot', input.screenshot, 'screenshot');

  let response: Response;
  try {
    response = await fetch('/api/public/feedback', { method: 'POST', body, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.ok) return { ok: true };
  if (response.status === 413) return { ok: false, reason: 'too_big' };
  const data = (await response.json().catch(() => ({}))) as { code?: string; contact?: string | null };
  switch (data.code) {
    case 'full':
      return { ok: false, reason: 'full', contact: data.contact ?? null };
    case 'invalid':
    case 'bad_image':
    case 'rate_limited':
      return { ok: false, reason: data.code };
    default:
      return { ok: false, reason: 'network' };
  }
}

/**
 * Scales a picture down to at most 1600 px and re-encodes it as JPEG, so a
 * phone screenshot uploads quickly. Falls back to the original file if the
 * browser cannot decode it (the server then decides).
 */
export async function shrinkScreenshot(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SCREENSHOT_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
