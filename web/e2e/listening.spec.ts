import { expect, test, type Page } from '@playwright/test';
import type { HomeworkSet, Story } from '../src/types';

const words: HomeworkSet = {
  id: 'w', kind: 'sheet', title: 'Hitzak', receivedOn: null, description: null, sample: false, groups: [],
  entries: [['Eskola', 'escuela'], ['Etxea', 'casa'], ['Txakurra', 'perro'], ['Katua', 'gato'], ['Liburua', 'libro']].map(([basque, es], i) => ({
    id: `e${i}`, basque: basque!, translations: { es: [es!] }, note: null, group: null, emoji: null, image: null,
  })),
};
const audio = (c: string) => `/audio/${c.repeat(64)}.mp3`;
const short: Story = {
  id: 'triku-eskolan', title: 'Triku eskolan', format: 'short', difficulty: 1,
  transcript: 'Triku eskolara doa. Txapi etxean dago.',
  translations: { es: 'Triku va a la escuela. Txapi está en casa.', ru: 'Трику идёт в школу. Чапи дома.' },
  questions: [
    { id: 'q1', prompt: { es: '¿Adónde va Triku?', ru: 'Куда идёт Трику?' }, options: [{ es: 'A la escuela', ru: 'В школу' }, { es: 'Al parque', ru: 'В парк' }], correct: 0 },
    { id: 'q2', prompt: { es: '¿Dónde está Txapi?', ru: 'Где Чапи?' }, options: [{ es: 'En la piscina', ru: 'В бассейне' }, { es: 'En casa', ru: 'Дома' }], correct: 1 },
  ],
  links: { sets: [], entries: [], words: ['Eskola', 'Etxea'], topics: [] }, audio: audio('a'), durationMs: 31000,
};
const extended: Story = { ...short, id: 'luzea', title: 'Istorio luzea', format: 'extended', difficulty: 2, audio: audio('b'), durationMs: 75000 };

async function prepare(page: Page, { missing = false, random = 0.01 } = {}) {
  await page.route('**/api/public/content', (r) => r.fulfill({ json: { schemaVersion: 2, sets: [words], stories: [short, extended], exams: [] } }));
  await page.route('**/api/public/stats', (r) => r.fulfill({ json: {} }));
  await page.route('**/audio/*.mp3', (r) => (missing ? r.fulfill({ status: 404 }) : r.fulfill({ contentType: 'audio/mpeg', body: 'story' })));
  await page.addInitScript((rnd) => {
    if (rnd !== null) Math.random = () => rnd;
    const w = window as unknown as { __plays: number; __pauses: number };
    w.__plays = w.__pauses = 0;
    HTMLMediaElement.prototype.play = function () { w.__plays++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { w.__pauses++; this.dispatchEvent(new Event('pause')); };
    // No real decoding in tests: the fake clip is never loaded.
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return ''; }, set() {} });
    HTMLMediaElement.prototype.load = function () {};
  }, random);
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: number }).__plays);

test('the listening section lists stories with length, level and status, and plays one', async ({ page }) => {
  await prepare(page, { random: null as unknown as number });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/escuchar');
  await expect(page.getByRole('heading', { name: 'Historias largas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historias cortas' })).toBeVisible();
  const card = page.locator('.story-card', { hasText: 'Istorio luzea' });
  await expect(card).toContainText('1 min 15 s');
  await expect(card).toContainText('Media');
  await expect(card).toContainText('Nueva');
  await expect(page.locator('.action-listen')).toContainText('Triku eskolan');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/listening-section.png', fullPage: true });

  await page.locator('.story-card', { hasText: 'Triku eskolan' }).click();
  // Nothing plays on its own, and the text is hidden.
  await expect(page.getByRole('button', { name: /Escuchar/ })).toBeVisible();
  expect(await plays(page)).toBe(0);
  await expect(page.locator('.story-transcript')).toHaveCount(0);
  await expect(page.locator('.story-question')).toHaveCount(0);

  await page.getByRole('button', { name: /Escuchar/ }).click();
  await expect.poll(() => plays(page)).toBe(1);
  await page.getByRole('button', { name: /Pausa/ }).click();
  await page.getByRole('button', { name: /Seguir/ }).click();
  await page.getByRole('button', { name: /Desde el principio/ }).click();
  await expect.poll(() => plays(page)).toBe(3);

  // Replaying costs nothing: answer both right, then open the text.
  await page.locator('.story-question').nth(0).getByRole('button', { name: 'A la escuela' }).click();
  await page.locator('.story-question').nth(1).getByRole('button', { name: 'En casa' }).click();
  await expect(page.getByText('Has acertado 2 de 2.')).toBeVisible();
  await page.getByRole('button', { name: /Ver el texto/ }).click();
  await expect(page.locator('.story-transcript [lang="eu"]')).toHaveText(short.transcript);
  await expect(page.locator('.story-transcript [lang="es"]')).toHaveText(short.translations.es);
  // Opening the text after answering does not change the result.
  await expect(page.getByText('Has acertado 2 de 2.')).toBeVisible();
  await page.screenshot({ path: 'test-results/listening-story.png', fullPage: true });
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await expect(page.locator('.stars-big')).toHaveAttribute('aria-label', '3 de 3 estrellas');

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('euskalduo.learner.v1')!));
  expect(state.stories['triku-eskolan']).toMatchObject({ plays: 1, completed: 1, correct: 2, answered: 2, supported: 0, passes: 1 });
  expect(state.entries, 'a story never changes word boxes').toEqual({});
  await page.goto('/#/escuchar');
  await expect(page.locator('.story-card', { hasText: 'Triku eskolan' })).toContainText('Entendida');
});

test('opening the text before answering counts as supported practice; questions follow the meaning language', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('euskalduo.learner.v1', JSON.stringify({ version: 2, lang: 'ru', entries: {}, skills: {}, stories: {}, sets: {} })));
  await page.goto('/#/escuchar/triku-eskolan');
  await page.getByRole('button', { name: /Escuchar/ }).click();
  await expect(page.locator('.story-question').first()).toContainText('Куда идёт Трику?');
  await page.getByRole('button', { name: /Ver el texto/ }).click();
  await expect(page.locator('.story-transcript [lang="ru"]')).toHaveText(short.translations.ru);
  await page.getByRole('button', { name: 'В школу' }).click();
  await page.getByRole('button', { name: 'Дома' }).click();
  await expect(page.getByText('Has acertado 2 de 2, con el texto.')).toBeVisible();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('euskalduo.learner.v1')!));
  expect(state.stories['triku-eskolan']).toMatchObject({ supported: 1, passes: 0 });
});

test('with sound off the story waits for an explicit "listen anyway", or can be skipped', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('euskalduo.learner.v1', JSON.stringify({ version: 2, sound: false, entries: {}, skills: {}, stories: {}, sets: {} })));
  await page.goto('/#/escuchar/triku-eskolan');
  await expect(page.getByText('El sonido está apagado.')).toBeVisible();
  expect(await plays(page)).toBe(0);
  await page.getByRole('button', { name: /Escuchar igualmente/ }).click();
  await page.getByRole('button', { name: /Escuchar/ }).click();
  await expect.poll(() => plays(page)).toBe(1);

  await page.goto('/#/escuchar/luzea');
  await page.getByRole('button', { name: 'Saltar la historia' }).click();
  await expect(page.getByText('Historia saltada.')).toBeVisible();
});

test('missing audio never blocks practice and is not counted as a mistake', async ({ page }) => {
  await prepare(page, { missing: true });
  await page.goto('/#/escuchar/triku-eskolan');
  await page.getByRole('button', { name: /Escuchar/ }).click();
  await expect(page.getByText(/Ahora no se puede escuchar esta historia/)).toBeVisible();
  await page.getByRole('button', { name: /Seguir/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('euskalduo.learner.v1') ?? '{}'));
  expect(state.stories?.['triku-eskolan']).toBeUndefined();
});

test('a short story appears inside a lesson without making it longer', async ({ page }) => {
  await prepare(page);
  await page.goto('/#/');
  await page.getByRole('link', { name: /Empezar/ }).click();
  let sawStory = false;
  for (let n = 0; n < 20; n++) {
    if (await page.getByRole('heading', { name: '¡Ronda terminada!' }).isVisible()) break;
    const label = await page.locator('.progress-label').first().innerText();
    expect(Number(label.match(/de (\d+)/)![1])).toBeLessThanOrEqual(10);
    const card = page.locator('.question-card');
    if (await card.locator('.story-block').count()) {
      sawStory = true;
      await expect(card).toContainText('Triku eskolan');
      expect(await plays(page), 'no word voice reads the story').toBeLessThanOrEqual(n);
      await card.getByRole('button', { name: /Escuchar/ }).click();
      await card.locator('.story-question').nth(0).locator('.option').first().click();
      await card.locator('.story-question').nth(1).locator('.option').first().click();
      await page.screenshot({ path: 'test-results/lesson-story.png', fullPage: true });
      await card.getByRole('button', { name: /Siguiente/ }).click();
      continue;
    }
    if (await card.locator('.options').count()) await card.locator('.option').first().click();
    else await card.getByRole('button', { name: 'No lo sé' }).click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
  }
  expect(sawStory).toBe(true);
  await expect(page.getByRole('heading', { name: '¡Ronda terminada!' })).toBeVisible();
});
