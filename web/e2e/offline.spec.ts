import { expect, test, type Page } from '@playwright/test';

// Offline mode needs the real service worker (blocked in the other specs).
test.use({ serviceWorkers: 'allow' });

/** Waits until the service worker is installed and controls the page. */
async function waitForWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  }
}

async function answerUntilDone(page: Page) {
  for (let i = 0; i < 25; i++) {
    if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) return;
    const card = page.locator('.question-card');
    if (await card.locator('.options').count()) await card.locator('.option').first().click();
    else if (await card.locator('.order-sequence').count()) {
      while (await card.locator('.tiles .order-chip').count()) await card.locator('.tiles .order-chip').first().click();
      await card.getByRole('button', { name: 'Comprobar' }).click();
    } else if (await card.locator('.tile').count()) {
      await card.getByRole('button', { name: 'No lo sé' }).click();
    } else {
      await card.locator('input').fill('xyz');
      await card.getByRole('button', { name: 'Comprobar' }).click();
    }
    await page.getByRole('button', { name: /Siguiente/ }).click();
  }
  await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
}

const pending = (page: Page) => page.evaluate(() => localStorage.getItem('euskalduo.stats.pending.v1'));

test('downloads, practises on a plane, and reports the counters once back online', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Esta semana/ })).toBeVisible();
  await waitForWorker(page);

  await page.goto('/#/ajustes');
  // The sample content has no pictures or speech, and the worker saved the words
  // on install, so this may already say "ready"; downloading again is harmless.
  await page.getByRole('button', { name: /Descargar para usar sin conexión|Actualizar la descarga/ }).click();
  await expect(page.getByText('Listo para practicar sin conexión.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Actualizar la descarga/ })).toBeVisible();

  const stats: string[] = [];
  // Only what the server accepted (tries while offline fail and are retried later).
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/api/public/stats' && r.ok()) stats.push(r.request().postData() ?? '');
  });

  // Airplane mode: the app still opens from the saved copy and can be played.
  await context.setOffline(true);
  await page.reload();
  // Every page: the small header pill. Home: the sentence that explains it.
  await expect(page.locator('.app-header').getByRole('status', { name: 'Sin conexión' })).toBeVisible();
  await page.getByRole('link', { name: /EUSKALDUO/ }).click();
  await expect(page.getByText(/Sin conexión\. Puedes seguir practicando/)).toBeVisible();
  await page.screenshot({ path: 'test-results/offline-home.png' });
  await page.getByRole('link', { name: /Esta semana/ }).click();
  await answerUntilDone(page);
  await page.screenshot({ path: 'test-results/offline-round.png' });

  const waiting = JSON.parse((await pending(page))!);
  const [day] = Object.keys(waiting);
  expect(waiting[day!].rounds).toBe(1);
  const answered = Object.values(waiting[day!].answers as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(answered).toBeGreaterThan(0);

  // Back on the ground: everything is sent under the day it happened, and the queue empties.
  const sent = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/public/stats' && r.ok());
  await context.setOffline(false);
  await sent;
  await expect.poll(() => pending(page)).toBeNull();
  await expect.poll(() => stats.length).toBeGreaterThan(0);
  const bodies = stats.filter(Boolean).map((b) => JSON.parse(b));
  const delivered = bodies.filter((b) => b.rounds === 1);
  expect(delivered).toHaveLength(1);
  expect(delivered[0].day).toBe(day);
  expect(Object.values(delivered[0].answers as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(answered);
  await expect(page.getByRole('status', { name: 'Sin conexión' })).toHaveCount(0);
});

test('a plain visit is enough to open the app and practise offline (without pictures or speech)', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Esta semana/ })).toBeVisible();
  await waitForWorker(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: /Esta semana/ }).click();
  await expect(page.locator('.question-card')).toBeVisible();
});

test('pictures and speech are kept for offline use and the admin area is left alone', async ({ page, context }) => {
  const image = `/uploads/${'a'.repeat(32)}.webp`;
  const audio = `/audio/${'b'.repeat(64)}.mp3`;
  const set = {
    id: 'offline-media', kind: 'week', title: 'Offline media', weekStart: '2026-10-05', description: null, sample: false, groups: [],
    entries: ['Kaixo', 'Agur', 'Txakurra'].map((basque, i) => ({
      id: `e${i}`, basque, translations: { es: [['hola'], ['adiós'], ['perro']][i]! }, note: null, group: null, emoji: null,
      image: i === 0 ? image : null, audio: i === 0 ? audio : null,
    })),
  };
  // context.route also sees requests made by the service worker.
  await context.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 1, sets: [set] } }));
  await context.route('**/uploads/*.webp', (r) => r.fulfill({ contentType: 'image/webp', body: 'picture' }));
  await context.route('**/audio/*.mp3', (r) => r.fulfill({ contentType: 'audio/mpeg', body: 'speech' }));

  await page.goto('/');
  await waitForWorker(page);
  await page.goto('/#/ajustes');
  await page.getByRole('button', { name: /Descargar para usar sin conexión/ }).click();
  await expect(page.getByText('Listo para practicar sin conexión.')).toBeVisible();

  await context.unrouteAll();
  await context.setOffline(true);
  const offline = await page.evaluate(async (urls) => Promise.all(urls.map(async (u) => {
    const r = await fetch(u);
    return [r.status, await r.text()];
  })), [image, audio, '/api/public/content']);
  expect(offline[0]).toEqual([200, 'picture']);
  expect(offline[1]).toEqual([200, 'speech']);
  expect(JSON.parse(offline[2]![1] as string).sets[0].id).toBe('offline-media');

  // Nothing of the admin area is stored or answered by the worker.
  const adminCached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))).flat();
    return urls.filter((u) => u.startsWith('/admin') || u.startsWith('/api/admin'));
  });
  expect(adminCached).toEqual([]);
  const admin = await page.evaluate(() => fetch('/api/admin/session').then(() => 'answered', () => 'network error'));
  expect(admin).toBe('network error');
});

test('home shows "Novedades para descargar" after new pictures or speech appear, only for devices that downloaded', async ({ page, context }) => {
  const clip = (c: string) => `/audio/${c.repeat(64)}.mp3`;
  const entries = (audio: (string | null)[]) => ['Kaixo', 'Agur', 'Txakurra'].map((basque, i) => ({
    id: `e${i}`, basque, translations: { es: [['hola'], ['adiós'], ['perro']][i]! }, note: null, group: null, emoji: null, image: null, audio: audio[i] ?? null,
  }));
  let catalogue = entries([clip('1'), null, null]);
  await context.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 1, sets: [{
    id: 'update-week', kind: 'week', title: 'Update week', weekStart: '2026-10-05', description: null, sample: false, groups: [], entries: catalogue,
  }] } }));
  await context.route('**/audio/*.mp3', (r) => r.fulfill({ contentType: 'audio/mpeg', body: 'speech' }));
  const pill = page.getByRole('link', { name: /Novedades para descargar/ });

  await page.goto('/');
  await waitForWorker(page);
  await page.reload();
  await expect(page.getByRole('link', { name: /Esta semana/ })).toBeVisible();
  await expect(pill, 'never downloaded: no nagging').toHaveCount(0);

  await page.goto('/#/ajustes');
  await page.getByRole('button', { name: /Descargar para usar sin conexión/ }).click();
  await expect(page.getByText('Listo para practicar sin conexión.')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: /Esta semana/ })).toBeVisible();
  await expect(pill, 'everything saved').toHaveCount(0);

  // The voice worker finished two more clips after the download.
  catalogue = entries([clip('1'), clip('2'), clip('3')]);
  await page.reload();
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('aria-label', /2 dibujos o audios nuevos/);
  await page.screenshot({ path: 'test-results/update-pill.png' });

  // Offline the server cannot be asked: no update pill, only the offline pill.
  await context.setOffline(true);
  await expect(pill).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);

  await pill.click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('.offline-card')).toBeInViewport();
  await expect(page.getByText('Faltan 2 dibujos o audios por descargar.')).toBeVisible();
  await page.getByRole('button', { name: /Descargar para usar sin conexión/ }).click();
  await expect(page.getByText('Listo para practicar sin conexión.')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: /Esta semana/ })).toBeVisible();
  await expect(pill).toHaveCount(0);
});
