import { expect, test } from '@playwright/test';
import type { HomeworkSet } from '../src/types';

const audio = `/audio/${'a'.repeat(64)}.mp3`;
const set: HomeworkSet = { id: 'case', kind: 'week', title: 'Casing test', weekStart: '2026-10-05',
  description: null, sample: false, groups: [], entries: [
    { id: 'e1', basque: 'GAUR', translations: { es: ['hoy'] }, note: null, group: null, emoji: null, image: null, audio },
    { id: 'e2', basque: 'gu', translations: { es: ['nosotros'] }, note: null, group: null, emoji: null, image: null },
    { id: 'e3', basque: 'JOAN DEN ASTEAN', translations: { es: ['la semana pasada'] }, note: null, group: null, emoji: null, image: null },
  ] };

test('standardizes lists, prompts, feedback and replay labels without changing audio URLs', async ({ page }) => {
  await page.route('**/api/public/content', r => r.fulfill({ json: { schemaVersion: 1, sets: [set] } }));
  await page.route('**/api/public/stats', r => r.fulfill({ json: {} }));
  await page.route('**/audio/*.mp3', r => r.fulfill({ status: 404 }));
  await page.addInitScript(() => { Math.random = () => 0.01; });
  await page.goto('/#/semana/case');
  await expect(page.locator('.word-basque')).toHaveText(['Gaur', 'Gu', 'Joan den astean']);
  await expect(page.getByRole('button', { name: 'Escuchar: Gaur', exact: true })).toBeVisible();
  const request = page.waitForRequest((r) => r.url().endsWith(audio));
  await page.getByRole('button', { name: 'Escuchar: Gaur', exact: true }).click();
  expect((await request).url()).toContain(audio);
  await page.getByRole('link', { name: '¡A practicar!', exact: true }).click();
  await expect(page.locator('.prompt-basque')).toHaveText('Gu');
  await page.locator('.option').first().click();
  await expect(page.locator('.feedback [lang="eu"]')).toContainText('Gu');
});

test('Basque answer choices use the same casing as word lists', async ({ page }) => {
  await page.route('**/api/public/content', r => r.fulfill({ json: { schemaVersion: 1, sets: [set] } }));
  await page.route('**/api/public/stats', r => r.fulfill({ json: {} }));
  await page.addInitScript(() => { Math.random = () => 0.6; });
  await page.goto('/#/practicar?modo=semana&id=case');
  await expect(page.locator('.prompt-meaning')).toBeVisible();
  await expect(page.locator('.option-label')).toHaveCount(3);
  expect((await page.locator('.option-label').allTextContents()).sort()).toEqual(['Gaur', 'Gu', 'Joan den astean'].sort());
});
