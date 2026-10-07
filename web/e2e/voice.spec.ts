import { expect, test, type Page } from '@playwright/test';
import type { HomeworkSet } from '../src/types';

const entries = ['Kaixo', 'Agur', 'Txakurra'].map((basque, i) => ({
  id: `e${i}`, basque, translations: { es: [['hola'], ['adiós'], ['perro']][i]! },
  note: null, group: null, emoji: null, image: null,
  audio: `/audio/${String(i + 1).repeat(64)}.mp3`,
}));
const set: HomeworkSet = { id: 'voice', kind: 'week', title: 'Voice test', weekStart: '2026-10-05', description: null, sample: false, groups: [], entries };

async function prepare(page: Page, rng = 0.01) {
  await page.route('**/api/public/content', (route) => route.fulfill({ json: { schemaVersion: 1, sets: [set] } }));
  await page.route('**/api/public/stats', (route) => route.fulfill({ json: {} }));
  await page.route('**/audio/*.mp3', (route) => route.fulfill({ contentType: 'audio/mpeg', body: 'clip' }));
  await page.addInitScript((random) => {
    Math.random = () => random;
    const w = window as unknown as { __plays: number; __pauses: number };
    w.__plays = w.__pauses = 0;
    HTMLMediaElement.prototype.play = function () { w.__plays++; return Promise.resolve(); };
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return ''; }, set() {} });
    HTMLMediaElement.prototype.pause = function () { w.__pauses++; };
    HTMLMediaElement.prototype.load = function () {};
  }, rng);
}
const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: number }).__plays);

test('speaks a Basque prompt, then its answer; mute and replay share the preference', async ({ page }) => {
  await prepare(page);
  await page.goto('/#/practicar?modo=semana&id=voice');
  await expect(page.locator('.prompt-basque')).toBeVisible();
  await expect.poll(() => plays(page)).toBe(1);
  await page.locator('.option').first().click();
  await expect.poll(() => plays(page)).toBe(2);
  await page.locator('.feedback .voice-button').click();
  await expect.poll(() => plays(page)).toBe(3);
  await page.getByRole('button', { name: 'Sonido activado', exact: true }).click();
  await expect(page.locator('.voice-button').first()).toBeDisabled();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await page.locator('.option').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
  await page.waitForTimeout(700);
  expect(await plays(page)).toBe(3);
  await page.goto('/#/semana/voice');
  await expect(page.locator('.word-card .voice-button')).toHaveCount(3);
  await expect(page.locator('.word-card .voice-button').first()).toBeDisabled();
});

test('does not speak the target before a Basque-choice answer and stops on exit', async ({ page }) => {
  await prepare(page, 0.6);
  await page.goto('/#/practicar?modo=semana&id=voice');
  await expect(page.locator('.prompt-meaning')).toBeVisible();
  await expect(page.locator('.question-card .voice-button')).toHaveCount(0);
  expect(await plays(page)).toBe(0);
  await page.locator('.option').first().click();
  await expect.poll(() => plays(page)).toBe(1);
  await page.getByRole('link', { name: 'Salir', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pauses: number }).__pauses)).toBeGreaterThan(0);
});
