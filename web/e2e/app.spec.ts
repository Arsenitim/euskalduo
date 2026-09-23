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
  test('plays the current week, gets feedback and rewards, and progress survives a reload', async ({ page, baseURL }) => {
    const requests = recordRequests(page);
    await page.goto('/');
    await page.getByRole('link', { name: /Ajustes/ }).click();
    await page.getByLabel('Tu nombre (opcional)').fill('Ane');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('link', { name: /EUSKALDUO/ }).click();
    await expect(page.getByRole('heading', { name: '¡Kaixo, Ane!' })).toBeVisible();

    await page.getByRole('link', { name: /Esta semana/ }).click();
    await expect(page.locator('.question-card')).toBeVisible();
    await answerCurrent(page);
    await playRound(page);
    await expect(page.locator('.stars-big')).toBeVisible();
    await page.screenshot({ path: 'test-results/round-summary.png' });

    await page.reload();
    await page.goto('/#/progreso');
    await expect(page.getByText(/practicadas/).first()).toBeVisible();
    const practiced = await page.locator('.week-meta').first().innerText();
    expect(practiced).not.toMatch(/^0 practicadas/);
    const stored = await page.evaluate(() => localStorage.getItem('euskalduo.learner.v1'));
    expect(JSON.parse(stored!).displayName).toBe('Ane');

    // Privacy: only same-origin GETs without bodies; nothing identifying leaves the browser.
    const origin = new URL(baseURL!).origin;
    for (const r of requests) {
      expect(new URL(r.url()).origin, r.url()).toBe(origin);
      expect(r.method(), r.url()).toBe('GET');
      expect(r.postData()).toBeNull();
      expect(new URL(r.url()).search, r.url()).toBe('');
      const headers = await r.allHeaders();
      expect(headers.cookie ?? '').toBe('');
      expect(JSON.stringify(headers)).not.toContain('Ane');
    }
    expect(requests.filter((r) => r.url().includes('/api/')).map((r) => new URL(r.url()).pathname)).toEqual(
      expect.arrayContaining(['/api/public/content']),
    );
    expect(requests.every((r) => !r.url().includes('/api/') || new URL(r.url()).pathname === '/api/public/content')).toBe(true);
    expect((await page.context().cookies()).length).toBe(0);
  });

  test('mixes earlier weeks chosen by the learner', async ({ page }) => {
    await page.goto('/#/mezclar');
    const older = page.locator('.check-list .check-card').first();
    const title = (await older.locator('strong').innerText()).trim();
    await older.click();
    await page.getByRole('button', { name: 'Empezar repaso' }).click();
    await expect(page.locator('.question-card')).toBeVisible();
    expect(title).toContain('HILABETEAK');
    await playRound(page);
  });
});

test.describe('admin', () => {
  test.skip(!ADMIN_PASSWORD, 'Set E2E_ADMIN_PASSWORD to run admin tests');

  test('rejects anonymous writes', async ({ request }) => {
    const r = await request.post('/api/admin/sets', { data: { title: 'x', entries: [] } });
    expect(r.status()).toBe(401);
  });

  test('imports, reviews, adds a picture, publishes and edits a set', async ({ page, browser }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/admin/');
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Homework sets' })).toBeVisible();

    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByLabel('Import content').fill(readFileSync(resolve(here, '../../samples/hiztegia-1-gaia.json'), 'utf8'));
    await page.getByRole('button', { name: 'Check & review' }).click();
    await expect(page.getByRole('heading', { name: 'Review before saving' })).toBeVisible();
    await expect(page.locator('.entry-row')).toHaveCount(26);
    await expect(page.locator('.entry-row').nth(6).getByLabel('Spanish')).toHaveValue('campeonato; concurso');

    await page.getByLabel('Title').fill('E2E 1.Gaia');
    await page.getByLabel('Homework week (Monday)').fill('2026-09-28');
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

    // A fresh learner sees it, with the picture, as the newest week.
    const learner = await browser.newPage();
    await learner.goto('/#/semanas');
    await learner.getByRole('link', { name: /E2E 1\.Gaia/ }).click();
    await expect(learner.getByText('cubo de la basura / papelera')).toBeVisible();
    await expect(learner.locator('img.word-visual')).toHaveCount(1);
    await learner.close();

    // Clean up.
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Homework sets' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E 1.Gaia' })).toHaveCount(0);
  });
});
