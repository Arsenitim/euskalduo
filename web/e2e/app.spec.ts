import { expect, test, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const PNG = resolve(here, 'fixtures/mochila.png');

/** Answers whatever question is on screen (not necessarily correctly). */
async function answerCurrent(page: Page) {
  const card = page.locator('.question-card');
  // A listening block is answered as a whole (see listening.spec.ts); skipping it is fine here.
  if (await card.locator('.story-block').count()) {
    await card.getByRole('button', { name: /Saltar la historia|Seguir/ }).first().click();
    return;
  }
  // Basque → meaning: a picture would give the answer away before answering.
  const title = await card.locator('.prompt-title').innerText();
  if (title === '¿Qué significa?' || title === 'Escribe qué significa') {
    await expect(card.locator('.word-visual')).toHaveCount(0);
  }
  if (await card.locator('.options').count()) {
    await card.locator('.option').first().click();
  } else if (await card.locator('.order-sequence').count()) {
    while (await card.locator('.tiles .order-chip').count()) await card.locator('.tiles .order-chip').first().click();
    await card.getByRole('button', { name: 'Comprobar' }).click();
  } else if (await card.locator('.tile').count()) {
    const tiles = card.locator('.tile');
    for (let i = 0; i < (await tiles.count()); i++) await tiles.nth(i).click();
    await card.getByRole('button', { name: 'Comprobar' }).click();
  } else {
    await card.locator('input').fill('xyz');
    await card.getByRole('button', { name: 'Comprobar' }).click();
  }
  await expect(page.locator('.feedback')).toBeVisible();
  await page.getByRole('button', { name: /Siguiente/ }).click();
}

async function playRound(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) return;
    await answerCurrent(page);
  }
  await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
}

function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  return requests;
}

test.describe('learner', () => {
  test('"Empezar" starts a mixed lesson at once, gives feedback and rewards, and progress survives a reload', async ({ page, baseURL }) => {
    const requests = recordRequests(page);
    await page.goto('/');
    await page.getByRole('link', { name: /Ajustes/ }).click();
    await page.getByLabel('Tu nombre (opcional)').fill('Ane');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('link', { name: /EUSKALDUO/ }).click();
    await expect(page.getByRole('heading', { name: '¡Kaixo, Ane!' })).toBeVisible();

    const start = page.getByRole('link', { name: /Empezar/ });
    await expect(start).toContainText('Palabras, temas variados y comprensión oral. Ejercicios elegidos para ti.');
    await expect(page.getByText(/Esta semana|Elegir semana|Mezclar semanas/)).toHaveCount(0);
    await page.screenshot({ path: 'test-results/home.png' });
    await start.click();
    // No configuration step: the first question is right there.
    await expect(page).toHaveURL(/#\/leccion$/);
    await expect(page.locator('.question-card')).toBeVisible();
    await answerCurrent(page);
    await playRound(page);
    await expect(page.locator('.stars-big')).toBeVisible();
    await page.screenshot({ path: 'test-results/round-summary.png' });

    await page.reload();
    await page.goto('/#/progreso');
    await expect(page.getByRole('heading', { name: 'Lo que sabes hacer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconocer palabras' })).toBeVisible();
    await page.screenshot({ path: 'test-results/progress.png', fullPage: true });
    const stored = await page.evaluate(() => localStorage.getItem('euskalduo.learner.v1'));
    expect(JSON.parse(stored!).displayName).toBe('Ane');
    expect(JSON.parse(stored!).version).toBe(2);
    expect(Object.keys(JSON.parse(stored!).entries).length).toBeGreaterThan(0);

    // Privacy: same-origin GETs without bodies, plus anonymous stats counters;
    // nothing identifying leaves the browser.
    const origin = new URL(baseURL!).origin;
    const stats = requests.filter((r) => new URL(r.url()).pathname === '/api/public/stats');
    for (const r of requests) {
      expect(new URL(r.url()).origin, r.url()).toBe(origin);
      expect(new URL(r.url()).search, r.url()).toBe('');
      const headers = await r.allHeaders();
      expect(headers.cookie ?? '').toBe('');
      expect(JSON.stringify(headers)).not.toContain('Ane');
      if (stats.includes(r)) {
        expect(r.method()).toBe('POST');
        const body = JSON.parse(r.postData() ?? '{}');
        expect(['day', 'newDevice', 'activeToday', 'activeWeek', 'answers', 'rounds', 'breakdown']).toEqual(expect.arrayContaining(Object.keys(body)));
        // Breakdown rows carry only fixed labels and public set ids.
        for (const part of body.breakdown ?? []) {
          expect(['set', 'story', 'exercise', 'mode', 'connection', 'display']).toContain(part.dimension);
          expect(['dimension', 'key', 'answers', 'rounds']).toEqual(expect.arrayContaining(Object.keys(part)));
        }
        expect(r.postData()).not.toContain('Ane');
      } else {
        expect(r.method(), r.url()).toBe('GET');
        expect(r.postData()).toBeNull();
      }
    }
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.filter((r) => JSON.parse(r.postData()!).newDevice === true)).toHaveLength(1);
    expect(requests.filter((r) => r.url().includes('/api/')).map((r) => new URL(r.url()).pathname)).toEqual(
      expect.arrayContaining(['/api/public/content']),
    );
    expect(requests.every((r) => !r.url().includes('/api/') || ['/api/public/content', '/api/public/stats'].includes(new URL(r.url()).pathname))).toBe(true);
    expect((await page.context().cookies()).length).toBe(0);
  });

  test('topics and school sheets can be practised on their own; old week links lead there', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Temas' }).click();
    await expect(page.getByRole('heading', { name: 'Temas', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hojas del cole' })).toBeVisible();
    await expect(page.locator('.week-card', { hasText: /^ASTEGUNAK/ })).toContainText('7 palabras');

    await page.locator('.week-card', { hasText: 'ASTEGUNAK' }).first().click();
    await expect(page.locator('.word-group ol li')).toHaveCount(7);
    await page.getByRole('link', { name: '¡A practicar!' }).click();
    await playRound(page);

    // Bookmarks from the week era still work.
    await page.goto('/#/semanas');
    await expect(page).toHaveURL(/#\/temas$/);
    await page.goto('/#/mezclar');
    await expect(page).toHaveURL(/#\/leccion$/);
    await expect(page.locator('.question-card')).toBeVisible();
  });

  test('a lesson mixes material from several sheets and topics', async ({ page }) => {
    const sets = new Set<string>();
    page.on('request', (r) => {
      if (new URL(r.url()).pathname !== '/api/public/stats') return;
      for (const part of JSON.parse(r.postData() ?? '{}').breakdown ?? []) if (part.dimension === 'set') sets.add(part.key);
    });
    for (let lesson = 0; lesson < 3 && sets.size < 2; lesson++) {
      await page.goto('/#/');
      await page.getByRole('link', { name: /Empezar/ }).click();
      await playRound(page);
      await page.waitForTimeout(300);
    }
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });

  test('spelling offers a locked hint and "No lo sé" to skip', async ({ page }) => {
    // Play rounds until a letter-tiles question comes up (question types are random).
    for (let round = 0; round < 6; round++) {
      await page.goto('/');
      await page.getByRole('link', { name: /Empezar/ }).click();
      for (let i = 0; i < 20; i++) {
        const card = page.locator('.question-card');
        if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) break;
        if (await card.locator('.tile:not(.tile-word)').count()) {
          await card.getByRole('button', { name: /Pista/ }).click();
          await expect(card.locator('.slot-hint').first()).toBeVisible();
          await expect(card.getByRole('button', { name: /Pista/ })).toBeDisabled();
          await expect(card.getByRole('button', { name: /Borrar/ })).toBeDisabled();
          await card.getByRole('button', { name: 'No lo sé' }).click();
          await expect(page.locator('.feedback-wrong')).toBeVisible();
          return;
        }
        await answerCurrent(page);
      }
    }
    throw new Error('No spelling question with letter tiles came up');
  });

  test('plays answer sounds, and the mute toggle silences them', async ({ page }) => {
    // Count synthesised notes (headless Chromium has no speakers to listen to).
    await page.addInitScript(() => {
      const w = window as unknown as { __notes: number };
      w.__notes = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args: Parameters<typeof start>) {
        w.__notes++;
        return start.apply(this, args);
      };
    });
    const notes = () => page.evaluate(() => (window as unknown as { __notes: number }).__notes);

    await page.goto('/');
    await page.getByRole('link', { name: /Empezar/ }).click();
    // A story block makes no answer sound; get past it to a question that does.
    while (await page.locator('.story-block').count()) await answerCurrent(page);
    await answerCurrent(page);
    expect(await notes()).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Sonido activado' }).click();
    await expect(page.getByRole('button', { name: 'Sonido desactivado' })).toBeVisible();
    const before = await notes();
    await answerCurrent(page);
    await answerCurrent(page);
    expect(await notes()).toBe(before);

    await page.goto('/#/ajustes');
    await expect(page.getByRole('radio', { name: /No/ })).toBeChecked();
  });

});

test.describe('admin', () => {
  test.skip(!ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to run admin tests');

  test('rejects anonymous writes', async ({ request }) => {
    const r = await request.post('/api/admin/sets', { data: { title: 'x', entries: [] } });
    expect(r.status()).toBe(401);
  });

  test('a browser signed in to the admin area is not counted, until switched back on', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Sheets and topics' })).toBeVisible();

    const stats: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/public/stats') stats.push(r.postData() ?? '');
    });
    await page.goto('/#/');
    await page.getByRole('link', { name: /Empezar/ }).click();
    await answerCurrent(page);
    await page.waitForTimeout(500);
    expect(stats).toEqual([]);

    await page.goto('/admin/#/uso');
    const count = page.getByLabel('Count practice from this browser');
    await expect(count).not.toBeChecked();
    await expect(page.getByRole('heading', { name: 'By exercise type' })).toBeVisible();
    await count.check();
    await page.screenshot({ path: 'test-results/admin-usage.png', fullPage: true });

    await page.goto('/#/');
    await page.getByRole('link', { name: /Empezar/ }).click();
    while (await page.locator('.story-block').count()) await answerCurrent(page);
    const sent = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/public/stats');
    await answerCurrent(page);
    const body = JSON.parse((await sent).postData()!);
    expect(body.activeWeek).toBe(true);
    expect(body.breakdown.map((p: { dimension: string }) => p.dimension).sort()).toEqual(['connection', 'display', 'exercise', 'mode', 'set']);
    expect(body.breakdown.find((p: { dimension: string }) => p.dimension === 'mode').key).toBe('lesson');
  });

  test('imports, reviews, adds a picture, publishes and edits a set', async ({ page, browser }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/admin/');
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Sheets and topics' })).toBeVisible();

    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByLabel('Import content').fill(readFileSync(resolve(here, '../../samples/hiztegia-1-gaia.json'), 'utf8'));
    await page.getByRole('button', { name: 'Check & review' }).click();
    await expect(page.getByRole('heading', { name: 'Review before saving' })).toBeVisible();
    await expect(page.locator('.entry-row')).toHaveCount(26);
    await expect(page.locator('.entry-row').nth(6).getByLabel('Spanish')).toHaveValue('campeonato; concurso');

    await page.getByLabel('Title').fill('E2E 1.Gaia');
    // No date needed to publish.
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('heading', { name: /E2E 1\.Gaia/ })).toBeVisible();

    const row = page.locator('.entry-row').nth(3);
    await row.locator('input[type=file]').setInputFiles(PNG);
    await expect(row.locator('.image-cell img')).toBeVisible();
    await page.screenshot({ path: 'test-results/admin-editor.png' });

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published — learners can see it now.')).toBeVisible();

    // Edit after publishing.
    await page.locator('.entry-row').nth(0).getByLabel('Spanish').fill('cubo de la basura; papelera');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    // A fresh learner sees it, with the picture, among the school sheets.
    const learner = await browser.newPage();
    await learner.goto('/#/temas');
    await learner.getByRole('link', { name: /E2E 1\.Gaia/ }).click();
    await expect(learner.getByText('cubo de la basura / papelera')).toBeVisible();
    await expect(learner.locator('img.word-visual')).toHaveCount(1);
    await learner.close();

    // Clean up.
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Sheets and topics' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E 1.Gaia' })).toHaveCount(0);
  });
});
